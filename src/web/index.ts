import uuid from 'react-native-uuid';
import XstsToken from '../tokens/xststoken';
import Http from '../utils/http';
import {getSettings} from '../store/settingStore';
import {debugFactory} from '../utils/debug';

const log = debugFactory('web/index.ts');

export default class WebApi {
  webToken: XstsToken;
  settings: any;

  constructor(webToken: XstsToken) {
    this.webToken = webToken;
    this.settings = getSettings();
  }

  sendCommand(
    consoleId: string,
    commandType: string,
    command: string,
    params?: any,
  ) {
    log.info('[sendCommand]:', consoleId, commandType, command);
    const http = new Http();

    if (params === undefined) {
      params = [];
    }

    console.log('params:', params);

    const postParams = {
      destination: 'Xbox',
      type: commandType,
      command: command,
      sessionId: uuid.v4(),
      sourceId: 'com.microsoft.smartglass',
      parameters: params,
      linkedXboxId: consoleId,
    };

    return new Promise((resolve, reject) => {
      http
        .post(
          'xccs.xboxlive.com',
          '/commands',
          {
            Authorization:
              'XBL3.0 x=' +
              this.webToken.data.DisplayClaims.xui[0].uhs +
              ';' +
              this.webToken.data.Token,
            'Accept-Language': 'en-US',
            skillplatform: 'RemoteManagement',
            'x-xbl-contract-version': '4',
            'x-xbl-client-name': 'XboxApp',
            'x-xbl-client-type': 'UWA',
            'x-xbl-client-version': '39.39.22001.0',
          },
          postParams,
        )
        .then((res: any) => {
          log.info('[sendCommand] /commands/ response:', JSON.stringify(res));
          if (res.result) {
            resolve(res.result);
          } else {
            resolve([]);
          }
        })
        .catch(e => {
          console.log('error:', e);
          reject(e);
        });
    });
  }

  powerOff(consoleId: string) {
    return this.sendCommand(consoleId, 'Power', 'TurnOff');
  }

  sendText(consoleId: string, text: string) {
    return this.sendCommand(consoleId, 'Shell', 'InjectString', [
      {
        replacementString: text,
      },
    ]);
  }
}
