const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('refman',{invoke:(action,payload)=>ipcRenderer.invoke('refman',action,payload),onProgress:callback=>{const listener=(_,value)=>callback(value);ipcRenderer.on('refman-progress',listener);return()=>ipcRenderer.removeListener('refman-progress',listener);}});
