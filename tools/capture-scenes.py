"""Capture only the explicitly selected iPhone 17. Requires the running Expo client."""
import subprocess,time,pathlib,argparse,json
DEVICE='F370E370-887E-4C4F-A17A-CB48A322C4C9'
SCENES=['home','permission','album','template','character','generating','naming','edit','complete','detail','privacy','share','library','pet','memories','postcard','discover','profile','growth','anchors','flowers','report']
p=argparse.ArgumentParser();p.add_argument('scenes',nargs='*');args=p.parse_args()
root=pathlib.Path(__file__).resolve().parents[1];out=root/'docs/verification/screenshots';out.mkdir(parents=True,exist_ok=True)
for scene in args.scenes or SCENES:
 subprocess.run(['xcrun','simctl','openurl',DEVICE,'ai-diary-2://verification?scene='+scene],check=True,capture_output=True)
 time.sleep(1.5 if scene=='generating' else 2)
 number=SCENES.index(scene)+1 if scene in SCENES else 90
 dest=out/f'{number:02d}-{scene}.png'
 subprocess.run(['xcrun','simctl','io',DEVICE,'screenshot',str(dest)],check=True,capture_output=True)
 print(dest.name,flush=True)
