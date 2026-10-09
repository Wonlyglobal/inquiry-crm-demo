// Permission probe only: never records, stores, or uploads microphone audio.
export async function prepareMicrophone(mediaDevices){
 if(!mediaDevices?.getUserMedia)throw Error('当前浏览器无法访问麦克风，请在支持录音的浏览器中打开 CRM');
 try{const stream=await mediaDevices.getUserMedia({audio:true});stream.getTracks().forEach(track=>track.stop());}
 catch(error){if(error.name==='NotAllowedError')throw Error('麦克风未获允许：请在网站权限中允许麦克风，并检查系统麦克风权限，再点击“开启 Hello 唤醒”');if(error.name==='NotFoundError')throw Error('未找到麦克风，请连接麦克风后重试');throw Error('麦克风暂不可用，请检查设备是否被占用后重试');}
}
