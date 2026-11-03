#!/usr/bin/env python3
"""Control-flow/artifact checks only; this test does not emulate native pixels."""
from __future__ import annotations

from contextlib import contextmanager, redirect_stdout
from copy import deepcopy
import importlib.util
import io
import json
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest
from unittest.mock import patch

SOURCE=Path(__file__).with_name('browser_render_regression_414.py')
SPEC=importlib.util.spec_from_file_location('native_harness',SOURCE)
HARNESS=importlib.util.module_from_spec(SPEC);SPEC.loader.exec_module(HARNESS)


class Page:
    def __init__(self, calls, error=None, diagnostic=None, diagnostic_error=None):
        self.calls=calls;self.error=error;self.diagnostic=diagnostic
        self.diagnostic_error=diagnostic_error;self.poisoned=False

    def evaluate(self, expression):
        if expression=='()=>auditStaticTerrain.run()':
            self.calls.append('static')
            if self.error:
                self.poisoned=True
                raise RuntimeError(self.error)
            return {'strictStaticResult':'passed'}
        if expression=='window.__staticRasterDiagnostics||null':
            if self.diagnostic_error:raise RuntimeError(self.diagnostic_error)
            return deepcopy(self.diagnostic)
        raise AssertionError('Unexpected page evaluation: '+expression)


class NativeGateOrchestration(unittest.TestCase):
    def exercise(self, *, static_error=None, export_error=None, diagnostic_error=None,
                 setup_error=None, teardown_error=None, runtime_errors=None, out=None):
        calls=[];result={}
        main=Page(calls,static_error,{'gate':'static','maps':{'color':{'bytes':2}}},diagnostic_error)
        isolated=Page(calls,diagnostic={'gate':'export','maps':{'color':{'bytes':7}}})

        @contextmanager
        def factory():
            calls.append('export context enter')
            if setup_error:raise RuntimeError(setup_error)
            try:
                yield isolated
            finally:
                calls.append('export context exit')
                if teardown_error:raise RuntimeError(teardown_error)

        def export_check(page):
            calls.append('export')
            self.assertIs(page,isolated)
            self.assertIsNot(page,main)
            self.assertFalse(page.poisoned,'failed terrain renderer leaked into export')
            if export_error:raise RuntimeError(export_error)
            return {'strictExportResult':'passed'}

        failure=None
        with redirect_stdout(io.StringIO()):
            try:HARNESS.run_final_native_gates(main,factory,export_check,result,out,runtime_errors)
            except AssertionError as error:failure=str(error)
        return result,calls,failure

    def test_both_pass(self):
        with TemporaryDirectory(prefix='relay-native-gate-') as tmp:
            result,calls,failure=self.exercise(out=Path(tmp))
            self.assertIsNone(failure)
            self.assertEqual(calls,['static','export context enter','export','export context exit'])
            self.assertEqual(result['native_gate_status'],{'static_terrain':'passed','raster_export_415':'passed'})
            self.assertEqual(result['native_gate_failures'],[])
            self.assertEqual(json.loads((Path(tmp)/'browser_results.json').read_text()),result)

    def test_static_failure_still_runs_export_and_keeps_overall_failure(self):
        with TemporaryDirectory(prefix='relay-native-gate-') as tmp:
            out=Path(tmp);result,calls,failure=self.exercise(static_error='exact terrain pixels differ',out=out)
            self.assertEqual(calls,['static','export context enter','export','export context exit'])
            self.assertIn('static_terrain [fixture]: exact terrain pixels differ',failure)
            self.assertEqual(result['native_gate_status'],{'static_terrain':'failed','raster_export_415':'passed'})
            self.assertEqual(result['raster_export_415'],{'strictExportResult':'passed'})
            self.assertEqual(json.loads((out/'static_raster_failure.json').read_text())['gate'],'static')
            self.assertFalse((out/'raster_export_failure.json').exists())
            self.assertEqual(json.loads((out/'browser_results.json').read_text()),result)

    def test_both_failures_keep_separate_diagnostics(self):
        with TemporaryDirectory(prefix='relay-native-gate-') as tmp:
            out=Path(tmp);result,calls,failure=self.exercise(static_error='terrain failure',export_error='export failure',out=out)
            self.assertEqual(calls.count('static'),1);self.assertEqual(calls.count('export'),1)
            self.assertIn('terrain failure',failure);self.assertIn('export failure',failure)
            self.assertEqual(len(result['native_gate_failures']),2)
            self.assertEqual(json.loads((out/'static_raster_failure.json').read_text())['maps']['color']['bytes'],2)
            self.assertEqual(json.loads((out/'raster_export_failure.json').read_text())['maps']['color']['bytes'],7)
            for gate in ['static_terrain','raster_export_415']:
                errors=json.loads((out/(gate+'_errors.json')).read_text())
                self.assertEqual(len(errors),1);self.assertEqual(errors[0]['gate'],gate)

    def test_export_failure_alone_is_fatal(self):
        result,calls,failure=self.exercise(export_error='PNG parity differs')
        self.assertIn('raster_export_415 [fixture]: PNG parity differs',failure)
        self.assertEqual(result['native_gate_status'],{'static_terrain':'passed','raster_export_415':'failed'})
        self.assertEqual(calls.count('export'),1)

    def test_broken_static_diagnostic_cannot_block_export(self):
        with TemporaryDirectory(prefix='relay-native-gate-') as tmp:
            result,calls,failure=self.exercise(static_error='original terrain error',diagnostic_error='context closed',out=Path(tmp))
            self.assertIn('original terrain error',failure)
            self.assertEqual(result['native_gate_failures'][0]['diagnostic_error'],'context closed')
            self.assertEqual(calls.count('export'),1)

    def test_diagnostic_file_error_cannot_block_export(self):
        original=Path.write_text
        def write(path,*args,**kwargs):
            if path.name=='static_terrain_errors.json':raise OSError('artifact unavailable')
            return original(path,*args,**kwargs)
        with TemporaryDirectory(prefix='relay-native-gate-') as tmp,patch.object(Path,'write_text',write):
            result,calls,failure=self.exercise(static_error='original terrain error',out=Path(tmp))
            self.assertIn('original terrain error',failure)
            self.assertEqual(result['native_gate_failures'][0]['artifact_error'],'artifact unavailable')
            self.assertEqual(calls.count('export'),1)

    def test_export_setup_failure_is_reported(self):
        result,calls,failure=self.exercise(static_error='terrain error',setup_error='native context unavailable')
        self.assertEqual(calls,['static','export context enter'])
        self.assertEqual(result['native_gate_status'],{'static_terrain':'failed','raster_export_415':'failed'})
        self.assertIn('terrain error',failure);self.assertIn('isolated runtime setup/teardown',failure)
        self.assertIn('native context unavailable',failure)

    def test_export_cleanup_failure_cannot_report_success(self):
        result,calls,failure=self.exercise(teardown_error='context cleanup failed')
        self.assertEqual(calls,['static','export context enter','export','export context exit'])
        self.assertEqual(result['raster_export_415'],{'strictExportResult':'passed'})
        self.assertEqual(result['native_gate_status']['raster_export_415'],'failed')
        self.assertIn('context cleanup failed',failure)

    def test_runtime_errors_remain_fatal_after_both_gates(self):
        result,calls,failure=self.exercise(runtime_errors=['real runtime console error'])
        self.assertEqual(calls.count('export'),1)
        self.assertEqual(result['native_gate_status'],{'static_terrain':'passed','raster_export_415':'passed'})
        self.assertIn('real runtime console error',failure)
        self.assertEqual(result['runtime_errors'],['real runtime console error'])


if __name__=='__main__':unittest.main(verbosity=2)
