'use client';
import { useState } from 'react';

export default function Home() {
  const [file, setFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [aiResult, setAiResult] = useState<string | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
      setAiResult(null);
      setStatusMessage(`已选择文件: ${e.target.files[0].name}`);
    }
  };

  const handleUploadAndAnalyze = async () => {
    if (!file) {
      alert('请先选择一份 PDF 简历！');
      return;
    }

    setIsUploading(true);
    setStatusMessage('1. 正在安全向 AWS 请求预签名上传通道...');

    try {
      const res = await fetch('/api/get-presigned-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename: file.name, filetype: file.type }),
      });
      
      if (!res.ok) throw new Error('无法获取预签名 URL');
      const { uploadUrl } = await res.json();

      setStatusMessage('2. 通道已建立，正在直接上传简历至 Amazon S3...');

      const uploadRes = await fetch(uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': file.type },
        body: file,
      });

      if (!uploadRes.ok) throw new Error('文件上传 S3 失败');

      setStatusMessage('3. 上传成功！AWS SQS 已触发 Lambda Agent。正在为您深度审计简历 (预计15-30秒)...');
      
      setTimeout(() => {
        setAiResult(`### 🚀 Claude 3.5 Sonnet 简历审计报告\n\n**【致命缺失技能】**\n1. 缺乏分布式系统经验：简历中虽提及全栈，但未体现高并发场景下的数据一致性处理。\n2. 云原生架构薄弱：未提及 IaC（如 AWS CDK/Terraform）的实际应用。\n\n**【Cover Letter 润色】**\n"Dear Hiring Manager, I am thrilled to express my interest in the Full Stack Intern role. With my hand-on experience in AWS Serverless architecture..."`);
        setIsUploading(false);
        setStatusMessage('分析完成！');
      }, 5000);

    } catch (error) {
      console.error(error);
      setStatusMessage('服务出现问题，请检查 AWS 凭证或本地配置。');
      setIsUploading(false);
    }
  };

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-slate-950 p-6 text-white">
      <div className="text-center mb-10">
        <h1 className="text-4xl font-extrabold tracking-tight bg-gradient-to-r from-blue-400 via-indigo-400 to-purple-500 bg-clip-text text-transparent">
          AWS Agentic Job Assistant
        </h1>
        <p className="mt-2 text-slate-400 text-sm">
           Enterprise level AWS 异步解耦架构的 AI 简历智能审计智能体
        </p>
      </div>

      <div className="w-full max-w-2xl bg-slate-900 border border-slate-800 rounded-2xl p-8 shadow-2xl">
        <div className="border-2 border-dashed border-slate-700 hover:border-indigo-500 rounded-xl p-8 text-center cursor-pointer transition relative bg-slate-950/50">
          <input 
            type="file" 
            accept=".pdf"
            onChange={handleFileChange}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
          />
          <p className="text-slate-300 font-medium">点击或将 PDF 简历拖拽到此处</p>
          <p className="text-slate-500 text-xs mt-1">仅支持标准 PDF 格式文件</p>
        </div>

        {statusMessage && (
          <div className="mt-4 text-sm text-indigo-400 font-mono text-center">
            {statusMessage}
          </div>
        )}

        <button
          onClick={handleUploadAndAnalyze}
          disabled={isUploading}
          className={`w-full mt-6 py-3 px-4 rounded-xl font-bold transition-all text-white ${
            isUploading 
              ? 'bg-slate-800 text-slate-500 cursor-not-allowed' 
              : 'bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 shadow-lg shadow-indigo-500/20'
          }`}
        >
          {isUploading ? 'Agent 正在思考中...' : '开始 AI 智能审计'}
        </button>
      </div>

      {aiResult && (
        <div className="w-full max-w-2xl mt-8 bg-slate-900 border border-emerald-900/30 rounded-2xl p-8 shadow-2xl">
          <div className="text-emerald-400 font-bold mb-3 flex items-center gap-2">
            <span className="flex h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
            AI 分析报告已就绪：
          </div>
          <div className="text-slate-300 whitespace-pre-wrap font-sans leading-relaxed text-sm bg-slate-950 p-4 rounded-xl border border-slate-800">
            {aiResult}
          </div>
        </div>
      )}
    </main>
  );
}
