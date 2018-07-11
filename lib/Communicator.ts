import * as request from 'request-promise';

import { Authenticator } from './Authenticator';
import { Config } from './Config';
import { Logger } from './HALogger';
import { TokenStore } from './TokenStore';
import { Request, Tokens } from './types';

export class Communicator {
  authenticator: Authenticator;
  tokenStore: TokenStore;

  constructor() {
    this.authenticator = new Authenticator();
    this.tokenStore = new TokenStore();
  }

  async sendRequest(payload: Request.Payload) {
    Logger.debug('Sending payload', payload);

    let response = await request(payload);
    Logger.debug('Response', response);

    return response;
  }

  async buildMessageHeader(endpoint: string): Promise<Request.MessageHeader> {
    let tokens: Tokens = await this.tokenStore.getTokens();

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
        'Content-Type': Config.ContentType.FORM,
        'User-Agent': Config.USER_AGENT
      },
      method: 'POST',
      json: true,
      form: `message=${encodeURIComponent(JSON.stringify(message))}`
    }

    return payload;
  }
}