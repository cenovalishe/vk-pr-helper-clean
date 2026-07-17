import { app } from './yc/http';
import { getConfig } from './yc/config';

const PORT = 3001;

async function start() {
  console.log('Инициализация конфигурации...');
  try {
    const config = await getConfig();
    console.log('Конфигурация успешно загружена:', {
      vkAppId: config.vkAppId,
      vkOAuthRedirectUrl: config.vkOAuthRedirectUrl,
      ydbEndpoint: config.ydbEndpoint,
      ydbDatabase: config.ydbDatabase,
      s3BucketTemp: config.s3BucketTemp,
    });
  } catch (err) {
    console.error('Ошибка загрузки конфигурации. Проверьте .env.local файл:', err);
    process.exit(1);
  }

  app.listen(PORT, () => {
    console.log(`\n🚀 Локальный backend запущен на http://localhost:${PORT}`);
    console.log(`Для работы фронтенда с локальным бэкендом измените в .env.local:`);
    console.log(`VITE_API_URL=http://localhost:${PORT}`);
  });
}

start();
