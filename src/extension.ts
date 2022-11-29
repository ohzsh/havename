// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import axios from 'axios';
import * as vscode from 'vscode';
import { debounce } from 'lodash';

const youdao = require('youdao-fanyi');
const md5 = require('md5');

const createConfig = ()=>{
  const config = vscode.workspace.getConfiguration("vscodeFanyi");
  const from = config.get("Apifrom") as string;
  const appkey = config.get("Apiname") as string;
  const secret = config.get("Apikey") as string;
  const time = config.get('time') as number;
  return { from, appkey, secret, time };
};

const baidu = async (q: string) => {
  const { appkey:appid, secret:key }  = createConfig();
  const url = "https://fanyi-api.baidu.com/api/trans/vip/translate";
  const salt = Math.floor(Math.random() * 1000000);
  const sign = md5(appid + q + salt + key);
  try {
    // eslint-disable-next-line @typescript-eslint/naming-convention
    const result = await axios.get<{ trans_result: any[] }>(url, {
      params:{ from: 'auto', to: 'auto',  salt, sign, q, appid }
    });
    const { data } = result;
    if (data && data.trans_result && data.trans_result.length) {
      const [ textInfo = {} ] = data.trans_result;
      return { translation:[textInfo.dst] };
    }
  } catch (e) {
    console.log(e);
  }
  return '';
};

let preFrom:string = "";
let cacheYdFn:null | Function = null;
const fanyi = function (text:string){
  const { from, appkey, secret } = createConfig();
  if(from === "YD") {
    if(cacheYdFn && preFrom === from) {return cacheYdFn(text);}
    preFrom = from;
    return cacheYdFn = youdao({
      appkey,
      secret,
    });
  }
  if(from === "BD") {
    preFrom = from;
    return baidu(text);
  }
  vscode.window.showWarningMessage("暂不支持！");
};

const isCN = (text:string)=>/[\u4e00-\u9fa5]/.test(text);

const changeWord = (text: string)=> {
  if (!text.includes(" ") && text.match(/[A-Z]/)) {
    const str = text.replace(/([A-Z])/g, " $1");
    let value = str.substring(0, 1).toUpperCase() + str.substring(1);
    return value;
  }
  return text;
};

/**
 * 驼峰转换
 * @param str 
 * @param type d: 大驼峰 x:小驼峰
 * @returns string
 */
const camelize = (str:string, type: "d" | "x") => str.replace(/(?:^\w|[AZ]|\b\w)/g, (word, index) => { 
  if(type === "d") {return word.toUpperCase();}
  return index === 0 ? word .toLowerCase() : word.toUpperCase(); 
}).replace(/\s+/g, "");

const textToCodeMap:{
  [key in string] : (text:string)=>string
} = {
  cl: (text)=>text.toUpperCase().replace(/(\w+)(\s+)/g, '$1_'),
  xt: (text)=>camelize(text, "x"),
  dt: (text)=>camelize(text, "d"),
};
const transTextToCode = (type: string, text:string) => textToCodeMap[type](text);


const registerTransformPlugIn = ()=>{
  const { time } = createConfig();
  const inputListener = debounce(async function(e: { reason: unknown, document: { lineAt: (arg0: number) => any; uri: vscode.Uri; }; }){
    if(e.reason) {return;}
    const selection = (vscode.window.activeTextEditor as vscode.TextEditor).selection;
    const lineNumber = selection.start.line;
    const curLineDoc = e.document.lineAt(lineNumber);
    const lineText = curLineDoc.text;
    const searchRes = lineText.match(/(((?:x|X)(?:t|T)|(?:d|D)(?:t|T)|(?:c|C)(?:l|L)):(\w|[\u4e00-\u9fa5])+)[\s\:\*\/( =><+-]?/) || [];
    const [,needTranstionText] = searchRes;
    if(needTranstionText?.length) {
      const [type, text] = needTranstionText.split(':');
      const editor = new vscode.WorkspaceEdit();
      const startQuotePosition = new vscode.Position(lineNumber, searchRes.index as number);
      const { translation:[ transText ] } = await fanyi(changeWord(text)) || {};
      const rightText = isCN(transText) ? transText : transTextToCode(type.toLowerCase(), transText?.trim());
      editor.replace(e.document.uri, new vscode.Range(
        startQuotePosition,
        startQuotePosition.translate(undefined, (searchRes.index as number) + text.length + 1)
      ), rightText);
      vscode.workspace.applyEdit(editor);
    }
  }, time);

  vscode.workspace.onDidChangeTextDocument(inputListener);
};

export async function activate(context: vscode.ExtensionContext) {
  registerTransformPlugIn();
}

// This method is called when your extension is deactivated
export function deactivate() {}
