import { createApp } from './bootstrap';
async function main() {
  const app = await createApp();
  await app.listen(Number(process.env.PORT || 3001), process.env.HOST || '127.0.0.1');
  console.log(`ProdFlow API: http://localhost:${process.env.PORT || 3001}/api/v1/health`);
}
void main();
