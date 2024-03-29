/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy of this
 * software and associated documentation files (the "Software"), to deal in the Software
 * without restriction, including without limitation the rights to use, copy, modify,
 * merge, publish, distribute, sublicense, and/or sell copies of the Software, and to
 * permit persons to whom the Software is furnished to do so.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED,
 * INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A
 * PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT
 * HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION
 * OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE
 * SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 */

import {
  AdminCreateUserCommand,
  AdminCreateUserCommandInput,
  AdminCreateUserCommandOutput,
  AdminGetUserCommand,
  AdminGetUserCommandInput,
  AdminGetUserCommandOutput,
  AdminUpdateUserAttributesCommand,
  AdminUpdateUserAttributesCommandInput,
  AdminUpdateUserAttributesCommandOutput,
  CognitoIdentityProviderClient,
  DescribeIdentityProviderCommand,
  DescribeIdentityProviderCommandInput,
  DescribeIdentityProviderCommandOutput,
  DescribeUserPoolClientCommand,
  DescribeUserPoolClientCommandInput,
  DescribeUserPoolClientCommandOutput,
  ListUserPoolClientsCommand,
  ListUserPoolClientsCommandInput,
  ListUserPoolClientsCommandOutput,
  paginateListUserPoolClients,
  UserPoolClientType
} from "@aws-sdk/client-cognito-identity-provider";
import {
  DynamoDBClient,
  GetItemCommand,
  GetItemCommandInput,
  paginateScan,
  PutItemCommand,
  PutItemCommandOutput,
  PutItemInput,
  QueryCommand,
  QueryCommandInput,
  QueryCommandOutput,
  ScanCommand,
  ScanCommandInput,
  ScanCommandOutput,
  TransactWriteItemsCommand,
  TransactWriteItemsCommandInput,
  TransactWriteItemsCommandOutput,
  UpdateItemCommand,
  UpdateItemCommandInput,
  UpdateItemCommandOutput
} from "@aws-sdk/client-dynamodb";
import { GetParameterCommand, GetParameterCommandInput, GetParameterCommandOutput, SSMClient } from "@aws-sdk/client-ssm";

import { Paginator } from "@aws-sdk/types";
import { marshall as ddbMarshal, unmarshall as ddbUnmarshal } from "@aws-sdk/util-dynamodb";

import { Powertools } from "./Powertools";
import { GetRandomPasswordCommand, GetRandomPasswordCommandInput, GetRandomPasswordCommandOutput, SecretsManagerClient } from "@aws-sdk/client-secrets-manager";

export type PaginationConfig = {
  pageSize?: number;
  startingToken?: any;
  stopOnSameToken?: boolean;
};

export interface AwsApiCalls {
  getParameter(input: GetParameterCommandInput): Promise<GetParameterCommandOutput>;

  updateItem(input: UpdateItemCommandInput): Promise<UpdateItemCommandOutput>;

  getItem(input: GetItemCommandInput): Promise<Record<string, any> | undefined>;

  scan(input: ScanCommandInput): Promise<Record<string, any>[] | undefined>;

  transactWriteItems(input: TransactWriteItemsCommandInput): Promise<TransactWriteItemsCommandOutput>;

  putItem(input: PutItemInput): Promise<PutItemCommandOutput>;

  query(input: QueryCommandInput): Promise<QueryCommandOutput>;

  adminCreateUser(input: AdminCreateUserCommandInput): Promise<AdminCreateUserCommandOutput>;

  adminGetUser(input: AdminGetUserCommandInput): Promise<AdminGetUserCommandOutput>;

  adminUpdateUserAttributes(input: AdminUpdateUserAttributesCommandInput): Promise<AdminUpdateUserAttributesCommandOutput>;

  paginateScan(config: PaginationConfig, input: ScanCommandInput, ...additionalArguments: any): Paginator<ScanCommandOutput>;

  describeIdentityProvider(input: DescribeIdentityProviderCommandInput): Promise<DescribeIdentityProviderCommandOutput>;

  describeUserPoolClient(input: DescribeUserPoolClientCommandInput): Promise<DescribeUserPoolClientCommandOutput>;

  paginateListUserPoolClients(input: ListUserPoolClientsCommandInput): Paginator<ListUserPoolClientsCommandOutput>;

  findUserPoolClient(clientName: string, userPoolId: string): Promise<UserPoolClientType | undefined>;

  getRandomPassword(input: GetRandomPasswordCommandInput): Promise<GetRandomPasswordCommandOutput>;
}

export class Aws implements AwsApiCalls {
  static instance(config: { [key: string]: any | undefined } = {}, powertools: Powertools | undefined) {
    if (this._instance == undefined) {
      this._instance = new Aws(config, powertools);
    }
    return this._instance;
  }

  private static _instance: Aws | undefined;
  public readonly marshall = ddbMarshal;
  public readonly unmarshall = ddbUnmarshal;
  private _ssmClient?: SSMClient;
  private _ddbClient?: DynamoDBClient;
  private _secretsManagerClient?: SecretsManagerClient;
  private _cognitoIdentityProviderClient?: CognitoIdentityProviderClient;
  private config: { [key: string]: any | undefined };
  private _powertools: Powertools | undefined;

  private constructor(config: { [key: string]: any | undefined } = {}, powertools: Powertools | undefined) {
    this.config = config;
    this._powertools = powertools;
  }

  public newInstance(config: { [key: string]: any | undefined } = {}, powertools: Powertools | undefined): AwsApiCalls {
    return new Aws(config, powertools);
  }

  private get cognitoIdentityProviderClient(): CognitoIdentityProviderClient {
    if (this._cognitoIdentityProviderClient == undefined) {
      this._cognitoIdentityProviderClient = this._powertools
        ? this._powertools.tracer.captureAWSv3Client(
          new CognitoIdentityProviderClient({
            ...this.config,
            retryMode: "adaptive"
          })
        )
        : new CognitoIdentityProviderClient(this.config);
    }
    return this._cognitoIdentityProviderClient;
  }

  private get secretsManagerClient(): SecretsManagerClient {
    if (this._secretsManagerClient == undefined) {
      this._secretsManagerClient = this._powertools
        ? this._powertools.tracer.captureAWSv3Client(
          new SecretsManagerClient({
            ...this.config,
            retryMode: "adaptive"
          })
        )
        : new SecretsManagerClient(this.config);
    }
    return this._secretsManagerClient;
  }

  private get ssmClient(): SSMClient {
    if (this._ssmClient == undefined) {
      this._ssmClient = this._powertools
        ? this._powertools.tracer.captureAWSv3Client(
          new SSMClient({
            ...this.config,
            retryMode: "adaptive"
          })
        )
        : new SSMClient(this.config);
    }
    return this._ssmClient;
  }

  private get ddbClient(): DynamoDBClient {
    if (this._ddbClient == undefined) {
      this._ddbClient = this._powertools
        ? this._powertools.tracer.captureAWSv3Client(
          new DynamoDBClient({
            ...this.config,
            retryMode: "adaptive"
          })
        )
        : new DynamoDBClient(this.config);
    }
    return this._ddbClient;
  }

  async getParameter(input: GetParameterCommandInput): Promise<GetParameterCommandOutput> {
    return this.ssmClient.send(new GetParameterCommand(input));
  }

  async updateItem(input: UpdateItemCommandInput): Promise<UpdateItemCommandOutput> {
    return this.ddbClient.send(new UpdateItemCommand(input));
  }

  async getItem(input: GetItemCommandInput): Promise<Record<string, any> | undefined> {
    const response = await this.ddbClient.send(new GetItemCommand(input));
    if (response.Item !== undefined) {
      return this.unmarshall(response.Item);
    } else {
      console.warn(`No item found for input ${JSON.stringify(input)}`);
      return undefined;
    }
  }

  async transactWriteItems(input: TransactWriteItemsCommandInput): Promise<TransactWriteItemsCommandOutput> {
    return this.ddbClient.send(new TransactWriteItemsCommand(input));
  }

  async putItem(input: PutItemInput): Promise<PutItemCommandOutput> {
    return this.ddbClient.send(new PutItemCommand(input));
  }

  async query(input: QueryCommandInput): Promise<QueryCommandOutput> {
    return this.ddbClient.send(new QueryCommand(input));
  }

  async scan(input: ScanCommandInput): Promise<Record<string, any>[] | undefined> {
    const response = await this.ddbClient.send(new ScanCommand(input));
    if (response.Items !== undefined && response.Items.length > 0) {
      return response.Items.map((item) => {
        return this.unmarshall(item);
      });
    } else {
      console.warn(`No items found for input ${JSON.stringify(input)}`);
      return undefined;
    }
  }

  paginateScan(config: PaginationConfig, input: ScanCommandInput, ...additionalArguments: any): Paginator<ScanCommandOutput> {
    return paginateScan(
      {
        client: this.ddbClient,
        pageSize: config.pageSize,
        startingToken: config.startingToken,
        stopOnSameToken: config.stopOnSameToken
      },
      input,
      ...additionalArguments
    );
  }

  async adminCreateUser(input: AdminCreateUserCommandInput): Promise<AdminCreateUserCommandOutput> {
    return this.cognitoIdentityProviderClient.send(new AdminCreateUserCommand(input));
  }

  async adminGetUser(input: AdminGetUserCommandInput): Promise<AdminGetUserCommandOutput> {
    return this.cognitoIdentityProviderClient.send(new AdminGetUserCommand(input));
  }

  async adminUpdateUserAttributes(input: AdminUpdateUserAttributesCommandInput): Promise<AdminUpdateUserAttributesCommandOutput> {
    return this.cognitoIdentityProviderClient.send(new AdminUpdateUserAttributesCommand(input));
  }

  async describeIdentityProvider(input: DescribeIdentityProviderCommandInput): Promise<DescribeIdentityProviderCommandOutput> {
    return this.cognitoIdentityProviderClient.send(new DescribeIdentityProviderCommand(input));
  }

  async describeUserPoolClient(input: DescribeUserPoolClientCommandInput): Promise<DescribeUserPoolClientCommandOutput> {
    return this.cognitoIdentityProviderClient.send(new DescribeUserPoolClientCommand(input));
  }

  async listUserPoolClients(input: ListUserPoolClientsCommandInput): Promise<ListUserPoolClientsCommandOutput> {
    return this.cognitoIdentityProviderClient.send(new ListUserPoolClientsCommand(input));
  }

  paginateListUserPoolClients(input: ListUserPoolClientsCommandInput): Paginator<ListUserPoolClientsCommandOutput> {
    return paginateListUserPoolClients(
      {
        client: this.cognitoIdentityProviderClient
      },
      input
    );
  }

  async findUserPoolClient(clientName: string, userPoolId: string): Promise<UserPoolClientType | undefined> {
    let result: UserPoolClientType | undefined;

    for await (const page of this.paginateListUserPoolClients({
      UserPoolId: userPoolId
    })) {
      if (page.UserPoolClients != undefined && page.UserPoolClients.length > 0) {
        for (const client of page.UserPoolClients) {
          if (client.ClientName == clientName) {
            const describeUserPoolClientResponse = await this.describeUserPoolClient({
              ClientId: client.ClientId,
              UserPoolId: userPoolId
            });
            const userPoolClient = describeUserPoolClientResponse.UserPoolClient;
            if (userPoolClient != undefined) {
              this._powertools?.logger.info(`Found App Client ${userPoolClient.ClientName} details`);
              result = userPoolClient;
            }
          }
        }
      }
    }
    return result;
  }



  async getRandomPassword(input: GetRandomPasswordCommandInput): Promise<GetRandomPasswordCommandOutput> {
    return this.secretsManagerClient.send(new GetRandomPasswordCommand(input));
  }
}
