#!/usr/bin/env python3
"""Synthetic parser validation only; this file is not performance evidence."""
from copy import deepcopy
from pathlib import Path
import contextlib
import importlib.util
import io
import json
import statistics

ROOT=Path(__file__).resolve().parents[2]
spec=importlib.util.spec_from_file_location('perf_summary',ROOT/'tools'/'summarize_perf004.py')
S=importlib.util.module_from_spec(spec);spec.loader.exec_module(S)
cases=json.loads((ROOT/'tests'/'fixtures'/'perf004_synthetic_geometries.json').read_text(encoding='utf-8'))['cases']


def fixture(case='native'):
    c=cases[case]
    native=c['native']
    env={'userAgent':'synthetic-parser-fixture-NOT-a-browser-run','dpr':1,'viewport':[1280,720],
         'canvas':[1280,720],'requestedNative':native,'native':native,'renderScale':1,
         'graphics':{'synthetic':True},'driver':{'synthetic':True}}
    payloads={}
    for side in ['baseline','candidate']:
        chars=('a','b','e') if side=='baseline' else ('c','d','f')
        payload={'schema':'relay-moth-perf-001a/v1','samplesPerScenario':3,'browserErrors':[],
                 'source':{'commit':chars[0]*40,'tree':chars[1]*40,'manifestSha256':chars[2]*64,'trackedDirty':False},
                 'runs':[],'_purpose':'SYNTHETIC PARSER TEST ONLY; NOT PERFORMANCE EVIDENCE'}
        for rate in [1,4]:
            run={'cpuThrottle':rate,'environment':deepcopy(env),'scenarios':{}}
            for scenario in S.FOCUS:
                records=[]
                for i in range(3):
                    if side=='baseline':
                        phase_values=[(8,1,1,1),(2,8,1,1),(3,1,8,1)][i]
                        phases=dict(zip(S.BASE_PHASES,phase_values))
                        phases['static.floor']=phases['static.build']/2
                        calls={k:1 for k in phases}
                    else:
                        phase_values=[(1,10,1),(5,1,1),(1,5,10)][i]
                        phases=dict(zip(S.PATCH_PHASES,phase_values))
                        phases['static.patch.scratch']=phases['static.patch.build']/2
                        calls={k:1 for k in phases}
                        n=len(c['diagnostics']['regions'])
                        calls['static.patch.build']=n
                        calls['static.patch.scratch']=n
                        calls['static.patch.upload.color']=n
                        sync_rows=sum(r['ty1']-r['ty0'] for r in c['diagnostics']['regions'])
                        phases[S.COLOR_SYNC_PHASE]=[.75,.5,1.5][i]
                        calls[S.COLOR_SYNC_PHASE]=sync_rows
                    record={'name':'editor-paint','meta':{'layer':scenario},'pendingFrame':False,
                            'syncMs':100+3*i,'firstFrameAfterMs':110+3*i,'frameGapMs':125+3*i,
                            'phases':phases,'phaseCalls':calls}
                    if side=='candidate':
                        record['staticDiagnostics']=deepcopy(c['diagnostics'])
                        record['staticDiagnostics'].update(colorPolicy=S.COLOR_POLICY,colorSyncAttempts=sync_rows,
                            colorSyncReads=sync_rows,colorSyncPixels=sync_rows,readbackPixels=sync_rows,colorSyncMs=[.5,.25,1][i])
                        record['staticParity']={'native':deepcopy(native),'maps':{
                            channel:{'bytes':0,'pixels':0,'max':0,'examples':[],'changedOutside':0}
                            for channel in ['color','normal','specular']}}
                    records.append(record)
                summary={k:{'median':statistics.median(r[k] for r in records)} for k in S.METRICS}
                run['scenarios'][scenario]={'records':records,'summary':summary}
            payload['runs'].append(run)
        payloads[side]=payload
    data=payloads['candidate'];data['baseline']=payloads['baseline']
    source={'commit':'c'*40,'tree':'d'*40,'run_id':'SYNTHETIC-PARSER-ONLY','run_attempt':0,
            'platform':'synthetic','event_sha':'1'*40}
    return data,source


def last_record(data):
    return data['runs'][1]['scenarios']['editor-path']['records'][2]


def mutate_record(data, action):
    action(last_record(data))


def add_full_control(data):
    """Independent synthetic full work; do not call the parser's validator."""
    for side,payload in [('baseline',data['baseline']),('candidate',data)]:
        for run in payload['runs']:
            native=run['environment']['native'];area=native[0]*native[1]
            records=[]
            for i in range(3):
                full_values=([(8,1,1,1),(2,8,1,1),(3,1,8,1)] if side=='baseline' else [(10,1,1,1),(12,1,1,1),(11,8,1,1)])[i]
                phases=dict(zip(('static.build','static.upload.color','static.upload.normal','static.upload.specular'),full_values))
                calls={key:1 for key in phases}
                record={'name':'control-full-static',
                    'meta':{'room':'quiet_nest','mutation':'none','refresh':'forced-static','warmup':'room-entry-two-frames'},
                    'pendingFrame':False,'syncMs':200+5*i,'firstFrameAfterMs':215+5*i,'frameGapMs':225+5*i,
                    'phases':phases,'phaseCalls':calls,
                    'fullStaticControl':{'backgroundKeyMatches':True,'retainedCurrentStatic':False,'retainedMaterialMaps':False,
                        'colorPolicy':'canvas2d-row-sync-v1' if side=='candidate' else None,'hasStaticPlanner':side=='candidate'},
                    'staticDiagnostics':None,
                    'waterWorkDelta':{'fullRebuilds':0,'boundedUpdates':0,'fullLegacyUploads':0,'boundedLegacyUploads':0}}
                if side=='candidate':
                    phases.update({'static.plan':[1,5,1][i],'static.full.floor':full_values[0]*.6,'static.full.color-sync':[.75,.5,1.5][i]})
                    calls.update({'static.plan':1,'static.full.floor':1,'static.full.color-sync':19})
                    record['staticDiagnostics']={'mode':'full','reason':'forced','colorPolicy':'canvas2d-row-sync-v1',
                        'changedCells':0,'regions':[],'rasterCells':760,'pixels':area,'rasterPixels':area,
                        'scratchMode':'full','scratchPixels':area,'scratchBytes':area*12,
                        'scratchAllocationAttempts':3,'scratchAllocations':3,'scratchAllocationPixels':area*3,'scratchAllocationBytes':area*12,
                        'uploadCalls':3,'uploadBytes':area*12,'colorSyncAttempts':19,'colorSyncReads':19,'colorSyncPixels':19,
                        'readbackPixels':19,'retainedScratchPixels':0,'colorSyncMs':[.5,.25,1][i]}
                    record['staticParity']={'native':deepcopy(native),'maps':{
                        channel:{'bytes':0,'pixels':0,'max':0,'examples':[],'changedOutside':0}
                        for channel in ['color','normal','specular']}}
                records.append(record)
            run['scenarios']['control-full-static']={'records':records,
                'summary':{key:{'median':statistics.median(r[key] for r in records)} for key in ['syncMs','firstFrameAfterMs','frameGapMs']}}


def mutate_full(data,action,side='candidate'):
    payload=data if side=='candidate' else data['baseline']
    action(payload['runs'][1]['scenarios']['control-full-static']['records'][2])


def optimize_baseline_full(data):
    for old,new in zip(data['baseline']['runs'],data['runs']):
        for i,(before,after) in enumerate(zip(old['scenarios']['control-full-static']['records'],new['scenarios']['control-full-static']['records'])):
            before['fullStaticControl'].update(colorPolicy='canvas2d-row-sync-v1',hasStaticPlanner=True)
            before['staticDiagnostics']=deepcopy(after['staticDiagnostics'])
            before['phases'].update({'static.plan':[.5,1.5,.25][i],'static.full.color-sync':[.5,.75,1][i]})
            before['phaseCalls'].update({'static.plan':1,'static.full.color-sync':19})


positive=0
for case in ['native','local','overlap','two_x','integer_wide','integer_tall']:
    data,source=fixture(case)
    report=S.summarize(data,source,'a'*40,'c'*40)
    assert report['mapsChecked']['candidate']==36
    for row in report['rows']:
        assert row['baseline']['staticCombinedMs']['samples']==[11,12,13]
        assert row['baseline']['staticCombinedMs']['median']==12
        assert row['candidate']['staticCombinedMs']['samples']==[12,7,16]
        assert row['candidate']['staticCombinedMs']['median']==12
        expected_reads=sum(r['ty1']-r['ty0'] for r in cases[case]['diagnostics']['regions'])
        assert row['candidate']['colorPolicies']==[S.COLOR_POLICY]*3
        for key in ['colorSyncAttempts','colorSyncReads','colorSyncPixels','readbackPixels']:
            assert row['candidate']['counters'][key]['samples']==[expected_reads]*3
        assert row['candidate']['phaseCalls'][S.COLOR_SYNC_PHASE]==[expected_reads]*3
        assert row['candidate']['counters']['colorSyncMs']['samples']==[.5,.25,1]
        assert row['candidate']['counters']['colorSyncPhaseMs']['samples']==[.75,.5,1.5]
        assert row['baseline']['counters']=={}
        assert all(n==3 for n in row['baseline']['missingCounters'].values())
    with contextlib.redirect_stdout(io.StringIO()) as rendered:
        S.render(report)
    output=rendered.getvalue()
    assert 'scratchAllocationBytes' in output and '4MiB native peak' in output and 'not bound total GPU writes' in output
    assert S.COLOR_POLICY in output and 'nonadditive components' in output and 'colorSyncPhaseMs' in output
    positive+=1
# Some baseline counters are present in only one event; preserve the missing
# count and the measured value instead of silently filling either missing slot.
data,source=fixture()
for run in data['baseline']['runs']:
    for group in run['scenarios'].values():
        group['records'][1]['staticDiagnostics']={'scratchBytes':1234}
report=S.summarize(data,source)
for row in report['rows']:
    assert row['baseline']['missingCounters']['scratchBytes']==2
    assert row['baseline']['counters']['scratchBytes']['samples']==[1234]
positive+=1
# Finite zero timing is valid at the browser timer's resolution. Read counts
# remain nonzero, and neither timing component is added to the parent build.
data,source=fixture()
for run in data['runs']:
    for group in run['scenarios'].values():
        for record in group['records']:
            record['staticDiagnostics']['colorSyncMs']=0
            record['phases'][S.COLOR_SYNC_PHASE]=0
report=S.summarize(data,source)
for row in report['rows']:
    assert row['candidate']['staticCombinedMs']['samples']==[12,7,16]
    assert row['candidate']['counters']['colorSyncMs']['samples']==[0,0,0]
    assert row['candidate']['counters']['colorSyncPhaseMs']['samples']==[0,0,0]
positive+=1

checks=[]
def reject(label, action=None, case='native', expected=None, full=False, required=False, optimized_baseline=False):
    data,source=fixture(case)
    if full:
        add_full_control(data)
    if optimized_baseline:
        optimize_baseline_full(data)
    if action:
        action(data,source)
    try:
        S.summarize(data,source,require_full_control=required)
    except (S.EvidenceError,ValueError,TypeError,KeyError) as error:
        if expected:
            assert expected in str(error),(label,str(error))
        checks.append((label,str(error)))
    else:
        raise AssertionError('negative control unexpectedly passed: '+label)

reject('native peak above4MiB',case='native_overcap',expected='canvas peak budget exceeded')
reject('obsolete large integer local mode',case='local_overcap',expected='scratch mode disagrees')
reject('summed capacity above8MiB',case='cumulative_overcap',expected='cumulative canvas allocation budget exceeded')
reject('internally consistent local canvas forbidden at2x',case='two_x_wrong_local',expected='scratch mode disagrees')
reject('2x summed capacity above8MiB',case='two_x_cumulative_overcap',expected='cumulative canvas allocation budget exceeded')
reject('wrong fractional mode',lambda d,s:mutate_record(d,lambda r:r['staticDiagnostics'].__setitem__('scratchMode','local')),expected='scratch mode disagrees')
reject('wrong canvas origin',lambda d,s:mutate_record(d,lambda r:r['staticDiagnostics']['regions'][0].__setitem__('canvasX',1)),expected='containment')
reject('small native canvas',lambda d,s:mutate_record(d,lambda r:r['staticDiagnostics']['regions'][0].__setitem__('canvasWidth',1200)),expected='wrong source canvas')
reject('wrong per-region mode',lambda d,s:mutate_record(d,lambda r:r['staticDiagnostics']['regions'][0].__setitem__('canvasMode','local')),expected='wrong source canvas')
def prefix_region(record):
    region=record['staticDiagnostics']['regions'][0]
    region['rasterWidth']+=region['rasterX'];region['rasterX']=0
reject('obsolete fractional prefix',lambda d,s:mutate_record(d,prefix_region),expected='local aligned32px guard'.replace('aligned32','aligned 32'))
reject('wrong floor source halo',lambda d,s:mutate_record(d,lambda r:r['staticDiagnostics']['regions'][0].__setitem__('tx0',0)),expected='floor inputs disagree')
def clip_peak(record):
    diag=record['staticDiagnostics'];region=diag['regions'][0]
    diag['scratchPixels']=region['rasterWidth']*region['rasterHeight'];diag['scratchBytes']=diag['scratchPixels']*4
reject('clip area mislabeled capacity',lambda d,s:mutate_record(d,clip_peak),expected='scratchPixels disagrees')
reject('extra allocation attempt',lambda d,s:mutate_record(d,lambda r:r['staticDiagnostics'].__setitem__('scratchAllocationAttempts',2)),expected='scratchAllocationAttempts disagrees')
reject('missing successful allocation',lambda d,s:mutate_record(d,lambda r:r['staticDiagnostics'].__setitem__('scratchAllocations',0)),expected='scratchAllocations disagrees')
reject('cumulative bytes undercounted',lambda d,s:mutate_record(d,lambda r:r['staticDiagnostics'].__setitem__('scratchAllocationBytes',r['staticDiagnostics']['scratchBytes'])),case='overlap',expected='scratchAllocationBytes disagrees')
reject('allocation field missing',lambda d,s:mutate_record(d,lambda r:r['staticDiagnostics'].pop('scratchAllocationPixels')),expected='missing/invalid')
reject('retained scratch',lambda d,s:mutate_record(d,lambda r:r['staticDiagnostics'].__setitem__('retainedScratchPixels',1)),expected='retainedScratchPixels disagrees')
reject('last-sample parity byte',lambda d,s:mutate_record(d,lambda r:r['staticParity']['maps']['color'].__setitem__('bytes',1)),expected='color bytes is nonzero')
reject('last-sample parity omitted',lambda d,s:mutate_record(d,lambda r:r.pop('staticParity')),expected='missing post-timing staticParity')
reject('missing material parity',lambda d,s:mutate_record(d,lambda r:r['staticParity']['maps'].pop('normal')),expected='incomplete parity maps')
reject('paired environment mismatch',lambda d,s:d['baseline']['runs'][1]['environment'].__setitem__('dpr',2),expected='environments differ')
reject('candidate source mismatch',lambda d,s:s.__setitem__('tree','e'*40),expected='source.json tree')
reject('dirty baseline',lambda d,s:d['baseline']['source'].__setitem__('trackedDirty',True),expected='explicitly clean')
reject('missing manifest binding',lambda d,s:d['source'].pop('manifestSha256'),expected='missing manifest SHA256')
reject('unrelated historical baseline',lambda d,s:d.pop('baseline'),expected='No embedded same-invocation baseline')
reject('stored median differs from raw',lambda d,s:d['runs'][0]['scenarios']['editor-water']['summary']['syncMs'].__setitem__('median',999),expected='stored syncMs median differs')
reject('material upload during patch',lambda d,s:mutate_record(d,lambda r:r['phaseCalls'].__setitem__('static.patch.upload.normal',1)),expected='full/material work unexpectedly ran')
reject('phase call count underreported',lambda d,s:mutate_record(d,lambda r:r['phaseCalls'].__setitem__('static.patch.build',1)),case='overlap',expected='phase counts disagree')
reject('required phase missing',lambda d,s:mutate_record(d,lambda r:r['phases'].pop('static.plan')),expected='missing/invalid')
reject('frame pending',lambda d,s:mutate_record(d,lambda r:r.__setitem__('pendingFrame',True)),expected='incomplete post-event frame')
reject('event metadata differs',lambda d,s:mutate_record(d,lambda r:r.__setitem__('meta',{'different':True})),expected='metadata differs')
reject('native parity dimensions differ',lambda d,s:mutate_record(d,lambda r:r['staticParity'].__setitem__('native',[640,360])),expected='parity native size differs')
reject('color policy omitted',lambda d,s:mutate_record(d,lambda r:r['staticDiagnostics'].pop('colorPolicy')),expected='static color policy')
reject('different color policy',lambda d,s:mutate_record(d,lambda r:r['staticDiagnostics'].__setitem__('colorPolicy','canvas2d-other-v1')),expected='static color policy')
for key in ['colorSyncAttempts','colorSyncReads','colorSyncPixels','readbackPixels']:
    reject(key+' undercounted',lambda d,s,key=key:mutate_record(d,lambda r:r['staticDiagnostics'].__setitem__(key,r['staticDiagnostics'][key]-1)),expected=key+' disagrees')
    reject(key+' missing',lambda d,s,key=key:mutate_record(d,lambda r:r['staticDiagnostics'].pop(key)),expected='missing/invalid')
def rewrite_sync(record,count):
    for key in ['colorSyncAttempts','colorSyncReads','colorSyncPixels','readbackPixels']:
        record['staticDiagnostics'][key]=count
    record['phaseCalls'][S.COLOR_SYNC_PHASE]=count
reject('consistent counters cannot replace derived rows',lambda d,s:mutate_record(d,lambda r:rewrite_sync(r,4)),expected='colorSyncAttempts disagrees')
reject('overlapping region rows incorrectly deduplicated',lambda d,s:mutate_record(d,lambda r:rewrite_sync(r,5)),case='overlap',expected='colorSyncAttempts disagrees')
reject('full-row synchronization substituted for bounded rows',lambda d,s:mutate_record(d,lambda r:rewrite_sync(r,19)),expected='colorSyncAttempts disagrees')
reject('sync phase count differs',lambda d,s:mutate_record(d,lambda r:r['phaseCalls'].__setitem__(S.COLOR_SYNC_PHASE,1)),expected='phase calls disagree')
reject('sync phase count missing',lambda d,s:mutate_record(d,lambda r:r['phaseCalls'].pop(S.COLOR_SYNC_PHASE)),expected='missing/invalid')
reject('sync count is not an integer',lambda d,s:mutate_record(d,lambda r:r['staticDiagnostics'].__setitem__('colorSyncReads',5.0)),expected='expected integer')
for label,value in [('negative',-1),('NaN',float('nan')),('infinite',float('inf')),('boolean',True),('string','1')]:
    reject('sync read time '+label,lambda d,s,value=value:mutate_record(d,lambda r:r['staticDiagnostics'].__setitem__('colorSyncMs',value)),expected='colorSyncMs: missing/invalid')
reject('sync read time missing',lambda d,s:mutate_record(d,lambda r:r['staticDiagnostics'].pop('colorSyncMs')),expected='colorSyncMs: missing/invalid')
reject('sync phase time missing',lambda d,s:mutate_record(d,lambda r:r['phases'].pop(S.COLOR_SYNC_PHASE)),expected='missing/invalid')
reject('sync phase time nonfinite',lambda d,s:mutate_record(d,lambda r:r['phases'].__setitem__(S.COLOR_SYNC_PHASE,float('inf'))),expected='missing/invalid')
assert positive==8 and len(checks)==56,'all pre-full-control checks must remain covered'

for case,required in [('native',True),('two_x',False)]:
    data,source=fixture(case);add_full_control(data)
    report=S.summarize(data,source,'a'*40,'c'*40,require_full_control=required)
    assert report['fullControlPresent'] and report['fullControlRequired'] is required
    assert report['waterPathMapsChecked']=={'baseline':0,'candidate':36}
    assert report['fullControlMapsChecked']=={'baseline':0,'candidate':18}
    assert report['mapsChecked']=={'baseline':0,'candidate':54}
    controls=[r for r in report['rows'] if r['scenario']=='control-full-static']
    assert len(controls)==2
    for row in controls:
        before,after=row['baseline'],row['candidate']
        assert before['staticCombinedMs']['samples']==[11,12,13]
        assert after['staticCombinedMs']['samples']==[14,20,22]
        assert after['staticCombinedMs']['median']==20,'planning must be included before taking the event median'
        assert after['phaseCalls']['static.plan']==[1,1,1]
        assert after['phaseCalls']['static.full.color-sync']==[19,19,19]
        assert after['counters']['colorSyncPhaseMs']['samples']==[.75,.5,1.5]
        assert after['counters']['colorSyncMs']['samples']==[.5,.25,1]
        assert after['counters']['rasterCells']['samples']==[760]*3
        assert after['counters']['scratchAllocationBytes']['samples']==[cases[case]['native'][0]*cases[case]['native'][1]*12]*3
        assert after['counters']['scratchAllocationBytes']['median']>8*1024*1024,'full controls must not inherit partial cumulative ceilings'
        assert before['counters']=={} and all(n==3 for n in before['missingCounters'].values())
    with contextlib.redirect_stdout(io.StringIO()) as rendered:
        S.render(report)
    output=rendered.getvalue()
    assert '54/54' in output and '18/18' in output and 'static.full.color-sync' in output
    assert '| 1x | control-full-static | staticCombinedMs |' in output
    positive+=1

# Zero timer resolution remains valid for full synchronization, while all19
# reads and the once-per-event planner remain mandatory.
data,source=fixture();add_full_control(data)
for run in data['runs']:
    for record in run['scenarios']['control-full-static']['records']:
        record['staticDiagnostics']['colorSyncMs']=0;record['phases']['static.full.color-sync']=0
report=S.summarize(data,source,require_full_control=True)
for row in report['rows']:
    if row['scenario']=='control-full-static':
        assert row['candidate']['staticCombinedMs']['samples']==[14,20,22]
        assert row['candidate']['counters']['colorSyncMs']['samples']==[0,0,0]
positive+=1

reject('required full control absent from historical evidence',required=True,expected='required control-full-static missing')
reject('full control absent on one paired source',lambda d,s:d['baseline']['runs'][1]['scenarios'].pop('control-full-static'),full=True,expected='scenario sets differ')
def remove_full_rate(data,_source):
    for payload in [data,data['baseline']]:payload['runs'][1]['scenarios'].pop('control-full-static')
reject('optional full control cannot cover only one throttle',remove_full_rate,full=True,expected='present at both throttle rates')
reject('full control missing third sample',lambda d,s:d['runs'][1]['scenarios']['control-full-static']['records'].pop(),full=True,required=True,expected='not all three records')
reject('full control unpresented frame',lambda d,s:mutate_full(d,lambda r:r.__setitem__('pendingFrame',True)),full=True,expected='incomplete post-event frame')
reject('full control wrong warmup',lambda d,s:mutate_full(d,lambda r:r['meta'].__setitem__('warmup','none')),full=True,expected='warmed metadata differs')
reject('full control mislabeled event',lambda d,s:mutate_full(d,lambda r:r.__setitem__('name','different')),full=True,expected='warmed metadata differs')
for key,value in [('backgroundKeyMatches',False),('retainedCurrentStatic',True),('retainedMaterialMaps',True)]:
    reject('full control invalid '+key,lambda d,s,key=key,value=value:mutate_full(d,lambda r:r['fullStaticControl'].__setitem__(key,value)),full=True,expected='background coherence or released surfaces')
reject('full control coherence observation missing',lambda d,s:mutate_full(d,lambda r:r.pop('fullStaticControl')),full=True,expected='capability/policy observation missing')
reject('full control includes water work',lambda d,s:mutate_full(d,lambda r:r['waterWorkDelta'].__setitem__('boundedUpdates',1)),full=True,expected='unrelated water work')
reject('full control water observation missing',lambda d,s:mutate_full(d,lambda r:r.pop('waterWorkDelta')),full=True,expected='water-work observation missing')
reject('baseline full control contains planning',lambda d,s:mutate_full(d,lambda r:r['phaseCalls'].__setitem__('static.plan',1),'baseline'),full=True,expected='planner call count differs')
reject('candidate full planner phase omitted',lambda d,s:mutate_full(d,lambda r:r['phases'].pop('static.plan')),full=True,expected='missing/invalid')
reject('candidate full planner called twice',lambda d,s:mutate_full(d,lambda r:r['phaseCalls'].__setitem__('static.plan',2)),full=True,expected='planner call count differs')
reject('candidate full build called twice',lambda d,s:mutate_full(d,lambda r:r['phaseCalls'].__setitem__('static.build',2)),full=True,expected='build once and upload each map once')
reject('candidate full normal upload omitted',lambda d,s:mutate_full(d,lambda r:r['phaseCalls'].__setitem__('static.upload.normal',0)),full=True,expected='build once and upload each map once')
reject('baseline full specular upload omitted',lambda d,s:mutate_full(d,lambda r:r['phaseCalls'].pop('static.upload.specular'),'baseline'),full=True,expected='missing/invalid')
reject('candidate full contains partial work',lambda d,s:mutate_full(d,lambda r:r['phaseCalls'].__setitem__('static.patch.build',1)),full=True,expected='contains partial work')
reject('baseline full contains partial work',lambda d,s:mutate_full(d,lambda r:r['phaseCalls'].__setitem__('static.patch.upload.color',1),'baseline'),full=True,expected='contains partial work')
for key,value,expected in [('mode','patch','forced full'),('reason','patch-failed','forced full'),('scratchMode','native-clip','partial canvas'),('regions',[{}],'partial canvas'),('colorPolicy','other','static color policy')]:
    reject('full control incorrect '+key,lambda d,s,key=key,value=value:mutate_full(d,lambda r:r['staticDiagnostics'].__setitem__(key,value)),full=True,expected=expected)
for key,value in [('changedCells',1),('rasterCells',759),('pixels',1),('rasterPixels',1),('scratchPixels',1),('scratchBytes',1),('scratchAllocationAttempts',4),('scratchAllocations',2),('scratchAllocationPixels',1),('scratchAllocationBytes',1),('uploadCalls',2),('uploadBytes',1),('colorSyncAttempts',18),('colorSyncReads',18),('colorSyncPixels',18),('readbackPixels',18),('retainedScratchPixels',1)]:
    reject('full control incorrect '+key,lambda d,s,key=key,value=value:mutate_full(d,lambda r:r['staticDiagnostics'].__setitem__(key,value)),full=True,expected='full '+key+' disagrees')
reject('full control read count missing',lambda d,s:mutate_full(d,lambda r:r['staticDiagnostics'].pop('colorSyncReads')),full=True,expected='missing/invalid')
reject('full control read time nonfinite',lambda d,s:mutate_full(d,lambda r:r['staticDiagnostics'].__setitem__('colorSyncMs',float('inf'))),full=True,expected='colorSyncMs: missing/invalid')
reject('full control sync phase called18times',lambda d,s:mutate_full(d,lambda r:r['phaseCalls'].__setitem__('static.full.color-sync',18)),full=True,expected='phase calls disagree with 19')
reject('full control sync phase time omitted',lambda d,s:mutate_full(d,lambda r:r['phases'].pop('static.full.color-sync')),full=True,expected='missing/invalid')
reject('full control missing exact parity',lambda d,s:mutate_full(d,lambda r:r.pop('staticParity')),full=True,expected='missing post-timing staticParity')
reject('full control nonzero material parity',lambda d,s:mutate_full(d,lambda r:r['staticParity']['maps']['normal'].__setitem__('bytes',1)),full=True,expected='normal bytes is nonzero')
reject('full control wrong parity extent',lambda d,s:mutate_full(d,lambda r:r['staticParity'].__setitem__('native',[640,360])),full=True,expected='parity native size differs')
reject('full control stored median differs',lambda d,s:d['runs'][1]['scenarios']['control-full-static']['summary']['firstFrameAfterMs'].__setitem__('median',999),full=True,expected='stored firstFrameAfterMs median differs')

# This isolates the full-control capability contract; the study deliberately
# keeps its accepted legacy full-build water/path baseline contract unchanged.
data,source=fixture();add_full_control(data);optimize_baseline_full(data)
report=S.summarize(data,source,require_full_control=True)
for row in report['rows']:
    if row['scenario']=='control-full-static':
        before=row['baseline']
        assert before['fullControlPolicy']=='canvas2d-row-sync-v1' and before['fullControlHasPlanner'] is True
        assert before['staticCombinedMs']['samples']==[11.5,13.5,13.25]
        assert before['staticCombinedMs']['median']==13.25
        assert before['phaseCalls']['static.plan']==[1]*3 and before['phaseCalls']['static.full.color-sync']==[19]*3
        assert before['counters']['colorSyncReads']['samples']==[19]*3
        assert before['counters']['colorSyncPhaseMs']['samples']==[.5,.75,1]
        assert all(n==0 for n in before['missingCounters'].values())
assert report['fullControlMapsChecked']=={'baseline':0,'candidate':18},'optimized baseline parity remains optional'
positive+=1
for old,new in zip(data['baseline']['runs'],data['runs']):
    for before,after in zip(old['scenarios']['control-full-static']['records'],new['scenarios']['control-full-static']['records']):
        before['staticParity']=deepcopy(after['staticParity'])
report=S.summarize(data,source,require_full_control=True)
assert report['fullControlMapsChecked']=={'baseline':18,'candidate':18} and report['mapsChecked']=={'baseline':18,'candidate':54}
positive+=1

reject('full control missing capability token',lambda d,s:mutate_full(d,lambda r:r['fullStaticControl'].pop('colorPolicy')),full=True,expected='capability/policy observation missing')
reject('full control missing planner capability',lambda d,s:mutate_full(d,lambda r:r['fullStaticControl'].pop('hasStaticPlanner'),'baseline'),full=True,expected='capability/policy observation missing')
reject('full control unknown policy',lambda d,s:mutate_full(d,lambda r:r['fullStaticControl'].__setitem__('colorPolicy','unknown')),full=True,expected='unknown or inconsistent')
reject('legacy policy with planner capability',lambda d,s:mutate_full(d,lambda r:r['fullStaticControl'].__setitem__('hasStaticPlanner',True),'baseline'),full=True,expected='unknown or inconsistent')
reject('candidate falsely reports legacy capability',lambda d,s:mutate_full(d,lambda r:r['fullStaticControl'].update(colorPolicy=None,hasStaticPlanner=False)),full=True,expected='candidate full control lacks')
reject('legacy baseline unexpected diagnostics',lambda d,s:mutate_full(d,lambda r:r.__setitem__('staticDiagnostics',{}),'baseline'),full=True,expected='explicitly lack optimized diagnostics')
reject('legacy baseline omitted null diagnostics',lambda d,s:mutate_full(d,lambda r:r.pop('staticDiagnostics'),'baseline'),full=True,expected='explicitly lack optimized diagnostics')
reject('legacy baseline unexpected row sync',lambda d,s:mutate_full(d,lambda r:r['phaseCalls'].__setitem__('static.full.color-sync',19),'baseline'),full=True,expected='legacy full control unexpectedly synchronizes')
reject('optimized baseline missing diagnostics',lambda d,s:mutate_full(d,lambda r:r.__setitem__('staticDiagnostics',None),'baseline'),full=True,optimized_baseline=True,expected='current-policy full control lacks optimized diagnostics')
reject('optimized baseline missing planning',lambda d,s:mutate_full(d,lambda r:r['phaseCalls'].pop('static.plan'),'baseline'),full=True,optimized_baseline=True,expected='planner call count differs')
reject('optimized baseline incorrect full reads',lambda d,s:mutate_full(d,lambda r:r['staticDiagnostics'].__setitem__('colorSyncReads',18),'baseline'),full=True,optimized_baseline=True,expected='full colorSyncReads disagrees')
def baseline_parity_error(data,_source):
    record=data['baseline']['runs'][1]['scenarios']['control-full-static']['records'][2]
    record['staticParity']=deepcopy(data['runs'][1]['scenarios']['control-full-static']['records'][2]['staticParity'])
    record['staticParity']['maps']['specular']['max']=1
reject('optional baseline full parity must be exact',baseline_parity_error,full=True,optimized_baseline=True,expected='specular max is nonzero')
assert positive==13 and len(checks)==119,'all synthetic acceptance/rejection controls must remain covered'
print(f'PERF-004 EVIDENCE PARSER REGRESSION 4.15 PASS: {positive} synthetic positive cases; {len(checks)} negative controls rejected')
