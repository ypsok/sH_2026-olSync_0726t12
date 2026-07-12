$ErrorActionPreference = "Stop"

node tools\export-smarthub-data.mjs
git -c safe.directory=C:/Users/ypsok/OneDrive/Documents/SmartHub/OnlineSync/sH_2026-olSync_0726t12 add data/smarthub.enc.json
git -c safe.directory=C:/Users/ypsok/OneDrive/Documents/SmartHub/OnlineSync/sH_2026-olSync_0726t12 commit -m "Update encrypted SmartHub payload"
git -c safe.directory=C:/Users/ypsok/OneDrive/Documents/SmartHub/OnlineSync/sH_2026-olSync_0726t12 push
