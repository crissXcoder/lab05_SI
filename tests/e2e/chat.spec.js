// @ts-check
const { test, expect } = require('@playwright/test');

test.describe('UNA Chat - Pruebas End-to-End (E2E) con Playwright', () => {

  test.beforeEach(async ({ page }) => {
    // Navegar a la raíz del chat
    await page.goto('/');
    await expect(page).toHaveTitle(/Chat Socket.IO UNA/);
  });

  test('E2E Caso 1: Enviar una URL de imagen y verificar que se muestra y termina de cargar', async ({ page }) => {
    const imageUrl = 'https://picsum.photos/300/200.jpg';

    await page.getByPlaceholder('Username').fill('Usuario_Imagen');
    await page.getByPlaceholder('Escriba un mensaje').fill(imageUrl);
    await page.getByRole('button', { name: 'Send' }).click();

    // Localizar la imagen renderizada en la lista de mensajes
    const imgLocator = page.locator('#messages img').last();
    await expect(imgLocator).toBeVisible({ timeout: 10000 });

    // Verificar atributos y que la imagen haya completado su carga visual en el DOM
    await expect(imgLocator).toHaveAttribute('src', imageUrl);
    await expect(imgLocator).toHaveAttribute('alt', 'Imagen compartida');

    // Esperar a que la imagen cargue completamente
    await page.waitForFunction((img) => img.complete && img.naturalWidth > 0, await imgLocator.elementHandle());
    const isComplete = await imgLocator.evaluate((img) => img.complete && img.naturalWidth > 0);
    expect(isComplete).toBeTruthy();
  });

  test('E2E Caso 2: Enviar una URL de video y verificar que el reproductor <iframe> aparece y carga el contenido', async ({ page }) => {
    const videoUrl = 'https://www.youtube.com/watch?v=qYwlqx-JLok';

    await page.getByPlaceholder('Username').fill('Usuario_Video');
    await page.getByPlaceholder('Escriba un mensaje').fill(videoUrl);
    await page.getByRole('button', { name: 'Send' }).click();

    // Localizar el iframe del reproductor
    const iframeLocator = page.locator('#messages iframe').last();
    await expect(iframeLocator).toBeVisible({ timeout: 10000 });

    // Verificar que el iframe cargue el reproductor seguro de YouTube con el ID correcto
    await expect(iframeLocator).toHaveAttribute('src', 'https://www.youtube.com/embed/qYwlqx-JLok');
    await expect(iframeLocator).toHaveAttribute('allowfullscreen', '');
  });

  test('E2E Caso 3: Enviar script malicioso, comprobar que no dispara alert y verificar saneamiento', async ({ page }) => {
    let alertTriggered = false;
    let alertMessage = '';

    // Registrar listener dialog ANTES del envío para detectar cualquier alert y hacer fallar la prueba
    page.on('dialog', async (dialog) => {
      alertTriggered = true;
      alertMessage = dialog.message();
      await dialog.dismiss();
      throw new Error(`¡Vulnerabilidad XSS activa! El alert se disparó con mensaje: "${alertMessage}"`);
    });

    const scriptPayload = "<script>alert('Inyección de script');</script>";

    await page.getByPlaceholder('Username').fill('Atacante_XSS');
    await page.getByPlaceholder('Escriba un mensaje').fill(scriptPayload);
    await page.getByRole('button', { name: 'Send' }).click();

    // Esperar que el mensaje aparezca en la lista
    const lastMessage = page.locator('#messages li').last();
    await expect(lastMessage).toBeVisible({ timeout: 10000 });

    // Esperar un momento para garantizar que ningún script retrasado intente ejecutarse
    await page.waitForTimeout(1000);

    // 1. Confirmar que ningún alert se haya disparado
    expect(alertTriggered).toBeFalsy();

    // 2. Confirmar que el contenido fue saneado y se muestra como texto inofensivo
    await expect(lastMessage).toContainText("<script>alert('Inyección de script');</script>");

    // 3. Confirmar que NO existen elementos <script> ejecutables en el DOM de mensajes
    const scriptCount = await page.locator('#messages script').count();
    expect(scriptCount).toBe(0);
  });

});
