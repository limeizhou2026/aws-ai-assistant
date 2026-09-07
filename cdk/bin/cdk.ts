import * as cdk from 'aws-cdk-lib';
import { AiAssistantStack } from '../lib/cdk-stack'; 

const app = new cdk.App();
new AiAssistantStack(app, 'AiAssistantStack', {
  // 如果需要指定 AWS 账号和区域，可以取消下面两行的注释：
  // env: { account: process.env.CDK_DEFAULT_ACCOUNT, region: process.env.CDK_DEFAULT_REGION },
});
