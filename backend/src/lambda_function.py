import json
import boto3
import os
from pypdf import PdfReader

# 初始化 AWS 客户端
s3_client = boto3.client('s3')
bedrock_runtime = boto3.client('bedrock-runtime')
dynamodb = boto3.resource('dynamodb')
table = dynamodb.Table('JobApplications')

def lambda_handler(event, context):
    # 1. 从 SQS 消息中提取 S3 的 Bucket 和 Key
    for record in event['Records']:
        body = json.loads(record['body'])
        s3_info = body['Records'][0]['s3']
        bucket_name = s3_info['bucket']['name']
        file_key = s3_info['object']['key']
        
        # 下载 PDF 到 Lambda 临时内存 (/tmp 空间最大支持 10GB)
        local_path = f"/tmp/{os.path.basename(file_key)}"
        s3_client.download_file(bucket_name, file_key, local_path)
        
        # 2. 解析 PDF 文本
        reader = PdfReader(local_path)
        resume_text = ""
        for page in reader.pages:
            resume_text += page.extract_text()
            
        # 3. 构建 Agentic Prompt 并调用 AWS Bedrock
        # 面试官重点看这里：如何构建系统级 Prompt 促使 LLM 像 HR 一样思考
        system_prompt = "你是一位硅谷大厂的资深 Tech Lead 和 HR 专家。请严格对比用户的简历与目标岗位(JD)，找出 3 个致命缺失技能，并重写一封润色后的 Cover Letter。"
        
        user_content = f"简历内容:\n{resume_text}\n\n"
        
        # 组装 Bedrock (Claude 3.5) 的原生 Payload
        body_payload = json.dumps({
            "anthropic_version": "bedrock-2023-05-31",
            "max_tokens": 4000,
            "system": system_prompt,
            "messages": [
                {"role": "user", "content": user_content}
            ],
            "temperature": 0.5
        })
        
        response = bedrock_runtime.invoke_model(
            modelId="anthropic.claude-3-5-sonnet-20240620-v1:0",
            body=body_payload
        )
        
        # 4. 解析 Bedrock 的返回结果
        response_body = json.loads(response.get('body').read())
        ai_analysis = response_body['content'][0]['text']
        
        # 5. 存入 DynamoDB
        table.put_item(
            Item={
                'application_id': file_key.split('.')[0],
                'status': 'COMPLETED',
                'analysis_result': ai_analysis
            }
        )
        
    return {'statusCode': 200, 'body': 'Success'}