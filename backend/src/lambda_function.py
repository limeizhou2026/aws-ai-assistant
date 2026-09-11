import json
import os
import boto3
from botocore.exceptions import ClientError

# Initialize AWS clients
s3_client = boto3.client('s3')
dynamodb = boto3.resource('dynamodb')
bedrock_runtime = boto3.client('bedrock-runtime', region_name='us-east-1')

# Read the DynamoDB table name configured via environment variables in CDK
TABLE_NAME = os.environ.get('TABLE_NAME')
table = dynamodb.Table(TABLE_NAME) if TABLE_NAME else None

def lambda_handler(event, context):
    print("Received event: ", json.dumps(event))
    
    # 1. Parse the S3 event notification triggered via SQS
    for record in event.get('Records', []):
        try:
            # The SQS message body contains the JSON string sent by S3
            body = json.loads(record['body'])
            
            # Handle direct S3 events or S3 events wrapped via SNS/SQS
            if 'Records' in body:
                s3_event = body['Records'][0]
                bucket_name = s3_event['s3']['bucket']['name']
                object_key = s3_event['s3']['object']['key']
            else:
                # If triggered directly from S3 to SQS
                bucket_name = body['bucket']['name']
                object_key = body['object']['key']
                
            print(f"Processing file: {object_key} from bucket: {bucket_name}")
            
            # 2. Retrieve resume content from S3
            response = s3_client.get_object(Bucket=bucket_name, Key=object_key)
            file_content = response['Body'].read().decode('utf-8', errors='ignore')
            
            # 3. Construct the prompt and invoke Amazon Bedrock (Claude 3.5 Sonnet)
            prompt = f"""
            You are an expert technical recruiter and AI career coach. 
            Please analyze the following resume content, evaluate its strengths, weaknesses, 
            and provide a score out of 100 with actionable feedback.

            Resume Content:
            {file_content[:4000]}  # Truncate to first 4000 characters to prevent token limit overflow

            Please return a JSON response with the following keys:
            - "summary": A brief professional summary.
            - "score": An integer score from 0 to 100.
            - "strengths": A list of key strengths.
            - "improvements": A list of actionable suggestions for improvement.
            """
            
            payload = {
                "anthropic_version": "bedrock-2023-05-31",
                "max_tokens": 1000,
                "messages": [
                    {
                        "role": "user",
                        "content": prompt
                    }
                ]
            }
            
            # Invoke Claude 3.5 Sonnet on Amazon Bedrock
            bedrock_response = bedrock_runtime.invoke_model(
                modelId='anthropic.claude-3-5-sonnet-20241022-v2:0', 
                contentType='application/json',
                accept='application/json',
                body=json.dumps(payload)
            )
            
            result_body = json.loads(bedrock_response['body'].read())
            ai_text_response = result_body['content'][0]['text']
            
            print("AI Analysis Result:", ai_text_response)
            
            # 4. Save the analysis result into DynamoDB
            application_id = object_key.replace('/', '_') # Use the file key as a unique identifier
            if table:
                table.put_item(
                    Item={
                        'application_id': application_id,
                        'object_key': object_key,
                        'status': 'COMPLETED',
                        'analysis_result': ai_text_response
                    }
                )
                print(f"Successfully saved analysis for {application_id} to DynamoDB.")
                
        except Exception as e:
            print(f"Error processing record: {str(e)}")
            raise e
            
    return {
        'statusCode': 200,
        'body': json.dumps('Resume processing pipeline executed successfully!')
    }