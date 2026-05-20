'use strict';

require('dotenv').config();
const Groq = require('groq-sdk');

async function testGroq() {
  console.log('🔍 Testando TODOS os modelos da Groq...\n');
  
  const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

  // Tenta listar via API primeiro
  let apiModels = [];
  try {
    const list = await groq.models.list();
    apiModels = list.data.map(m => m.id);
    console.log(`📋 API retornou ${apiModels.length} modelos:\n`);
    apiModels.forEach(m => console.log(`   ${m}`));
    console.log('');
  } catch (e) {
    console.log('⚠️  Não foi possível listar via API, usando lista manual\n');
  }

  // Lista expandida para testar
  const manualModels = [
    // Llama 3.x
    'llama-3.3-70b-versatile',
    'llama-3.3-70b-specdec',
    'llama-3.1-8b-instant',
    'llama-3.1-70b-versatile',
    'llama-3.2-1b-preview',
    'llama-3.2-3b-preview',
    'llama-3.2-11b-vision-preview',
    'llama-3.2-90b-vision-preview',
    'llama3-8b-8192',
    'llama3-70b-8192',
    'llama3-groq-8b-8192-tool-use-preview',
    'llama3-groq-70b-8192-tool-use-preview',
    // Llama 4
    'meta-llama/llama-4-scout-17b-16e-instruct',
    'meta-llama/llama-4-maverick-17b-128e-instruct',
    // Gemma
    'gemma2-9b-it',
    'gemma-7b-it',
    // Mixtral
    'mixtral-8x7b-32768',
    // Deepseek
    'deepseek-r1-distill-llama-70b',
    'deepseek-r1-distill-qwen-32b',
    'deepseek-r1-distill-qwen-14b',
    'deepseek-r1-distill-qwen-7b',
    // Qwen
    'qwen-qwq-32b',
    'qwen/qwen3-32b',
    'qwen/qwen3-14b',
    'qwen/qwen3-7b',
    // Mistral
    'mistral-saba-24b',
    'mistral-7b-instruct',
    // Compound
    'compound-beta',
    'compound-beta-mini',
    // GPT-OSS
    'openai/gpt-oss-20b',
    'openai/gpt-oss-120b',
    // Allam
    'allam-2-7b',
    // Playai
    'playai-tts',
    'playai-tts-arabic',
    // Guard
    'llama-guard-3-8b',
    'llama-guard-3-11b-vision',
  ];

  // Remove duplicatas com os da API
  const allModels = [...new Set([...apiModels, ...manualModels])];
  
  console.log(`\n🧪 Testando ${allModels.length} modelos...\n`);

  const working = [];
  const blocked = [];
  const dead    = [];

  for (const model of allModels) {
    process.stdout.write(`  ${model}... `);
    
    try {
      const response = await groq.chat.completions.create({
        model,
        messages: [{ role: 'user', content: 'ok' }],
        max_tokens: 5,
        temperature: 0
      });
      
      const tokens = response.usage?.total_tokens || '?';
      console.log(`✅ OK (${tokens}t)`);
      working.push(model);
      
    } catch (error) {
      if (error.status === 403) {
        console.log('🔒 BLOQUEADO');
        blocked.push(model);
      } else if (error.status === 400 && error.message?.includes('decommissioned')) {
        console.log('💀 DESCONTINUADO');
        dead.push(model);
      } else if (error.status === 404 || error.message?.includes('does not exist')) {
        console.log('❓ INEXISTENTE');
        dead.push(model);
      } else if (error.status === 400) {
        console.log(`⚠️  INVÁLIDO`);
        dead.push(model);
      } else {
        console.log(`❌ ERRO ${error.status || '?'}`);
        dead.push(model);
      }
    }
    
    await new Promise(r => setTimeout(r, 400));
  }

  console.log('\n════════════════════════════════════');
  console.log('📊 RESULTADO FINAL');
  console.log('════════════════════════════════════');

  console.log(`\n✅ FUNCIONANDO (${working.length}):`);
  working.forEach(m => console.log(`   • ${m}`));

  console.log(`\n🔒 BLOQUEADOS (${blocked.length}):`);
  blocked.forEach(m => console.log(`   • ${m}`));

  console.log(`\n💀 INVÁLIDOS/DESCONTINUADOS (${dead.length}):`);
  dead.forEach(m => console.log(`   • ${m}`));

  console.log('\n════════════════════════════════════\n');
}

testGroq().catch(console.error);
