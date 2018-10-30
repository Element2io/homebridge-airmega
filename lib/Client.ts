import * as request from 'request-promise';

import { Config } from './Config';
import { Logger } from './Logger';
import { TokenStore } from './TokenStore';
import { PurifierResponse, Request } from './types';

export class Client {
  tokenStore: TokenStore;

  constructor() {
    this.tokenStore = new TokenStore();
  }

  async getStatus(id: string): Promise<PurifierResponse.Status> {
    let payload: Request.Payload = await this.buildStatusPayload(id, Config.Endpoints.STATUS);

    let response = await this.sendRequest(payload);
    let statusResponse = response.body.prodStatus[0];

    let status: PurifierResponse.Status = {
      power: statusResponse.power,
      light: statusResponse.light,
      fan: statusResponse.airVolume,
      state: statusResponse.prodMode,
      airQuality: statusResponse.dustPollution
    }

    return status;
  }

  async getFilterStatus(id: string): Promise<PurifierResponse.FilterStatus[]> {
    let payload: Request.Payload = await this.buildStatusPayload(id, Config.Endpoints.FILTERS);
    let response = await this.sendRequest(payload);

    let filterStatuses = response.body.filterList.map(filter => {
      let filterStatus: PurifierResponse.FilterStatus = {
        name: filter.filterName,
        lifeLevel: filter.filterPer
      }

      return filterStatus;
    })

    Logger.debug('Filter status', filterStatuses);

    return filterStatuses;
  }

  async setPower(id: string, on: boolean): Promise<void> {
    let value = on ? '1' : '0';
    let payload = await this.buildControlPayload(id, Config.Codes.POWER, value);

    await this.sendControlRequest(id, payload);
  }

  async setMode(id: string, auto: boolean): Promise<void> {
    let value = auto ? '1' : '2';
    let payload = await this.buildControlPayload(id, Config.Codes.MODE, value);

    await this.sendControlRequest(id, payload);
  }

  async setFanSpeed(id: string, speed: number): Promise<void> {
    let value = speed.toString();
    let payload = await this.buildControlPayload(id, Config.Codes.FAN, value);

    await this.sendControlRequest(id, payload);
  }

  async setLight(id: string, on: boolean): Promise<void> {
    let value = on ? '2' : '0';
    let payload = await this.buildControlPayload(id, Config.Codes.LIGHT, value);

    await this.sendControlRequest(id, payload);
  }

  private async sendControlRequest(id: string, payload: Request.Payload): Promise<void> {
    await this.sendRequest(payload);
    await this.refreshStatus(id);
  }

  private async refreshStatus(id: string): Promise<void> {
    let message = await this.buildStatusMessage(id, Config.Endpoints.CONTROL);
    message.body.refreshFlag = true;

    let payload = this.buildPayload(Config.Endpoints.CONTROL, message);

    await this.sendRequest(payload);
  }

  private async buildStatusMessage(id: string, endpoint: string): Promise<Request.Message> {
    let messageHeader: Request.MessageHeader = await this.buildMessageHeader(endpoint);

    let message: Request.Message = {
      header: messageHeader,
      body: {
        barcode: id,
        dvcBrandCd: 'MG',
        prodName: 'AIRMEGA',
        stationCd: '',
        resetDttm: '',
        deviceType: '004'
      }
    }

    return message;
  }

  private async buildStatusPayload(id: string, endpoint: string): Promise<Request.Payload> {
    let message = await this.buildStatusMessage(id, endpoint);
    let payload = this.buildPayload(endpoint, message);

    return payload;
  }

  private async buildControlPayload(id:string, code: string, value: string): Promise<Request.Payload> {
    let endpoint = Config.Endpoints.CONTROL;
    let messageHeader: Request.MessageHeader = await this.buildMessageHeader(endpoint);

    let message: Request.Message = {
      header: messageHeader,
      body: {
        barcode: id,
        funcList: [{
          comdVal: value,
          funcId: code
        }]
      }
    }

    let payload = this.buildPayload(endpoint, message);

    return payload;
  }

  private async sendRequest(payload: Request.Payload) {
    Logger.debug('Sending payload', payload);

    let response = await request.post(payload);
    Logger.debug('Response', response);

    return response;
  }

  async buildMessageHeader(endpoint: string): Promise<Request.MessageHeader> {
    let tokens = await this.tokenStore.getTokens();

    let header: Request.MessageHeader = {
      trcode: endpoint,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken
    }

    return header;
  }

  buildPayload(endpoint: string, message: Request.Message): Request.Payload {
    let payload: Request.Payload = {
      uri: `${Config.BASE_URI}/${endpoint}.json`,
      headers: {
        'User-Agent': Config.USER_AGENT,
        'Content-Type': Config.ContentType.FORM,
        Accept: 'application/json'
      },
      json: true,
      form: `message=${encodeURIComponent(JSON.stringify(message))}`
    }

    return payload;
  }
}