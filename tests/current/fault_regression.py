from pathlib import Path
import re
ROOT=Path(__file__).resolve().parents[2]

def main():
    js=(ROOT/'game.js').read_text(encoding='utf-8')
    ff=js[js.index('  frameFault(err,where){'):js.index('  resumeFromInput(){')]
    assert 'this.keys.clear()' not in ff, 'Recovered faults still clear keyboard state'
    assert 'this.paused=false' in ff
    update=js[js.index('  update(dt,now){'):js.index('  checkMothPickups(){')]
    critical=['player','moth-pickups','robot-pickups','objectives','doors']
    optional=['flock','followers','mini-robots','creatures','fireflies','particles','shader-fx','surface-fx']
    missing=[s for s in critical+optional if f"this.updateStep('{s}'" not in update]
    assert not missing, missing
    assert update.count('{critical:true}')>=len(critical)
    assert 'suspendedUntil' in js and 'noteUpdateFault' in js
    assert re.search(r"relay-moth-runtime-diagnostics-[0-9]+\.json",js), 'diagnostics export contract missing'
    assert 'desiredVx=ix*PLAYER_SPEED' in update and 'this.room.movePlayer' in update
    assert 'this.vx+=(desiredVx' not in update
    print('Relay Moth Forest 3.995.2 — recovered update fault regression')
    print('PASS')
    print('  frame faults preserve held keys')
    print(f'  {len(critical)} critical + {len(optional)} optional update subsystems isolated')
    print('  optional repeated faults back off instead of throwing every frame')
    print('  diagnostics filename is version-flexible; player movement remains direct')

if __name__=='__main__':main()
