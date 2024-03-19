import { Callback, Context } from "aws-lambda";
import { Aws, BasicLambdaTools, LambdaHandler, Powertools } from "../utils/";

const powertools = new Powertools({
  serviceName: "ATFServerIdentityProvider",
});

export const onEventHandler: LambdaHandler<
  Record<string, any>,
  Record<string, any>
> = async (
  event: Record<string, any>,
  _context: Context,
  _callback: Callback<Record<string, any>>,
  tools: BasicLambdaTools = {
    aws: Aws.instance({}, powertools),
    powertools,
  },
): Promise<Record<string, any>> => {
  // const {aws} = tools;
  const logger = tools.powertools.logger;
  logger.info(`Event: ${JSON.stringify(event)}`);
  return {};
};

export const onEvent = powertools.wrap(onEventHandler);
