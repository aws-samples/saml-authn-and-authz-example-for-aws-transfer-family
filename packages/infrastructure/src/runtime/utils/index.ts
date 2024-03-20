import {
  CognitoJwtVerifierProperties,
  CognitoJwtVerifierSingleUserPool,
} from "aws-jwt-verify/cognito-verifier";
import { SimpleJwksCache } from "aws-jwt-verify/jwk";
import { APIGatewayProxyEvent } from "aws-lambda";
import { Callback, Context, Handler } from "aws-lambda/handler";
import {
  APIGatewayProxyHandler,
  APIGatewayProxyResult,
} from "aws-lambda/trigger/api-gateway-proxy";
import { AwsApiCalls } from "./Aws";
import { Powertools } from "./Powertools";

export * from "./Aws";
export * from "./Powertools";

export interface BasicLambdaTools {
  aws: AwsApiCalls;
  powertools: Powertools;
}

export interface LambdaToolsWithJwtVerifier<
  T extends CognitoJwtVerifierProperties,
> extends BasicLambdaTools {
  verifier: CognitoJwtVerifierSingleUserPool<T>;
}

export class SimpleJwksCacheSingleton {
  static instance() {
    if (this._instance == undefined) {
      this._instance = new SimpleJwksCache();
    }
    return this._instance;
  }

  private static _instance: SimpleJwksCache | undefined;
}

export type LambdaHandler<TEvent = any, TResult = any> =
  Handler<TEvent, TResult> extends (
    event: TEvent,
    context: Context,
    callback: Callback<TResult>,
    tools: BasicLambdaTools,
  ) => infer R
    ? (
        event: TEvent,
        context: Context,
        callback: Callback<TResult>,
        tools: BasicLambdaTools,
      ) => R
    : never;

export type APIGatewayProxyLambdaHandler = APIGatewayProxyHandler extends (
  event: APIGatewayProxyEvent,
  context: Context,
  callback: Callback<APIGatewayProxyResult>,
  tools: BasicLambdaTools,
) => infer R
  ? (
      event: APIGatewayProxyEvent,
      context: Context,
      callback: Callback<APIGatewayProxyResult>,
      tools: BasicLambdaTools,
    ) => R
  : never;

export type APIGatewayProxyLambdaHandlerWithJwtVerifier<
  T extends CognitoJwtVerifierProperties,
> = APIGatewayProxyLambdaHandler extends (
  event: APIGatewayProxyEvent,
  context: Context,
  callback: Callback<APIGatewayProxyResult>,
  tools: LambdaToolsWithJwtVerifier<T>,
) => infer R
  ? (
      event: APIGatewayProxyEvent,
      context: Context,
      callback: Callback<APIGatewayProxyResult>,
      tools: LambdaToolsWithJwtVerifier<T>,
    ) => R
  : never;
