import QRCode from 'qrcode-terminal/vendor/QRCode/index.js';
import levels from 'qrcode-terminal/vendor/QRCode/QRErrorCorrectLevel.js';
import {deflateSync,crc32} from 'node:zlib';
export function pngQR(url){
 const qr=new QRCode(-1,levels.M);qr.addData(url);qr.make();
 const scale=8,size=(qr.getModuleCount()+8)*scale;
 const rows=Buffer.alloc(size*(size+1),255);
 for(let y=0;y<size;y++){
  rows[y*(size+1)]=0;
  for(let x=0;x<size;x++){
   const r=Math.floor(y/scale)-4,c=Math.floor(x/scale)-4;
   if(r>=0&&c>=0&&r<qr.getModuleCount()&&c<qr.getModuleCount()&&qr.isDark(r,c)) rows[y*(size+1)+1+x]=0;
  }
 }
 function chunk(type,data){
  const contents=Buffer.concat([Buffer.from(type),data]),size=Buffer.alloc(4),sum=Buffer.alloc(4);
  size.writeUInt32BE(data.length);sum.writeUInt32BE(crc32(contents));return Buffer.concat([size,contents,sum]);
 }
 const info=Buffer.alloc(13);info.writeUInt32BE(size);info.writeUInt32BE(size,4);info[8]=8;
 return Buffer.concat([Buffer.from('89504e470d0a1a0a','hex'),chunk('IHDR',info),chunk('IDAT',deflateSync(rows)),chunk('IEND',Buffer.alloc(0))]);
}
