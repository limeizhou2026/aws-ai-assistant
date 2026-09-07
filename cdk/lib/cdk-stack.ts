import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as s3n from 'aws-cdk-lib/aws-s3-notifications';
import { SqsEventSource } from 'aws-cdk-lib/aws-lambda-event-sources';
import * as path from 'path';

export class AiAssistantStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // 1. 创建 S3 Bucket 用于存放简历 (并配置文件生命周期，7天后自动删除以节省成本)
    const resumeBucket = new s3.Bucket(this, 'ResumeBucket', {
      versioned: true,
      removalPolicy: cdk.RemovalPolicy.DESTROY, // 适合开发环境，销毁 Stack 时一并销毁 Bucket
      autoDeleteObjects: true,
      lifecycleRules: [{ expiration: cdk.Duration.days(7) }],
      cors: [{
        allowedMethods: [s3.HttpMethods.PUT, s3.HttpMethods.POST],
        allowedOrigins: ['http://localhost:3000'], // 允许本地前端跨域上传
        allowedHeaders: ['*'],
      }],
    });

    // 2. 创建 SQS 消息队列 (设置 15 分钟的可见性超时，防止 Lambda 还没跑完大模型任务消息就重入队列)
    const jobQueue = new sqs.Queue(this, 'JobProcessingQueue', {
      visibilityTimeout: cdk.Duration.minutes(15), 
      retentionPeriod: cdk.Duration.days(1),
    });

    // 3. 配置 S3 事件通知：当有新文件创建时，将消息推送到 SQS
    resumeBucket.addEventNotification(
      s3.EventType.OBJECT_CREATED,
      new s3n.SqsDestination(jobQueue)
    );

    // 4. 创建 DynamoDB 存储 AI 分析结果
   const jobTable = new dynamodb.Table(this, 'JobApplicationsTable', {
      partitionKey: { name: 'application_id', type: dynamodb.AttributeType.STRING}, 
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
});

    // 5. 创建核心 AI Agent Lambda 函数 (使用 Python 运行环境)
    const agentLambda = new lambda.Function(this, 'AiAgentLambda', {
      runtime: lambda.Runtime.PYTHON_3_11,
      handler: 'lambda_function.lambda_handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '../../backend/src')), // 指向你的 Python 代码目录
      timeout: cdk.Duration.minutes(10), // AI 思考较慢，给予充足的超时时间
      memorySize: 512, // 512MB 内存足够解析 PDF 并调用 API
      environment: {
        BUCKET_NAME: resumeBucket.bucketName,
        TABLE_NAME: jobTable.tableName,
      },
    });

    // 6. 将 SQS 设置为 Lambda 的事件源 (Lambda 自动消费队列中的消息)
    agentLambda.addEventSource(new SqsEventSource(jobQueue, {
      batchSize: 1, // 每次只处理一份简历，防止并发模型调用超限
    }));

    // 7. 严格遵循 IAM 最小权限原则 (Least Privilege) —— 面试官的绝对加分项！
    resumeBucket.grantRead(agentLambda); // 仅允许 Lambda 读取 S3
    jobTable.grantWriteData(agentLambda); // 仅允许 Lambda 写入 DynamoDB

    // 8. 赋予 Lambda 调用 Amazon Bedrock 大模型的权限
    agentLambda.addToRolePolicy(new iam.PolicyStatement({
      actions: ['bedrock:InvokeModel'],
      resources: ['arn:aws:bedrock:*::foundation-model/anthropic.claude-3-5-sonnet-20240620-v1:0'],
    }));

    // 打印输出，方便前端配置
    new cdk.CfnOutput(this, 'BucketNameOutput', { value: resumeBucket.bucketName });
    new cdk.CfnOutput(this, 'TableNameOutput', { value: jobTable.tableName });
  }
}
