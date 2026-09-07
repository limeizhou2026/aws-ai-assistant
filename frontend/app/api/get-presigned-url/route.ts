import { NextResponse } from 'next/server';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

// 初始化 AWS S3 客户端（Next.js 服务端会自动读取你电脑本地的环境变量或 AWS Credentials）
const s3Client = new S3Client({
  region: process.env.AWS_REGION || 'us-east-1',
});

export async function POST(request: Request) {
  try {
    const { filename, filetype } = await request.json();
    
    // 给文件生成一个唯一的 Key (例如：1717800000_resume.pdf)，防止用户因文件名相同覆盖别人的简历
    const uniqueKey = `${Date.now()}_${filename}`;
    
    // 我们对应的 S3 Bucket 名字（在实际面试项目中，你可以写死或者读取 .env）
    // 注意：这里的名字要和你在 CDK 里创建的 Bucket 名字对上，我们先设定一个占位名，后续通过 CDK 产物自动化注入
    const bucketName = process.env.RESUME_BUCKET_NAME || 'ai-job-assistant-resumes-dev';

    const command = new PutObjectCommand({
      Bucket: bucketName,
      Key: uniqueKey,
      ContentType: filetype,
    });

    // 生成预签名 URL，设置有效期为 60 秒（过期后该链接作废，极度安全）
    const uploadUrl = await getSignedUrl(s3Client, command, { expiresIn: 60 });

    return NextResponse.json({
      uploadUrl,
      fileKey: uniqueKey,
    });
  } catch (error: any) {
    console.error('生成预签名 URL 失败:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}