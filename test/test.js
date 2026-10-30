const val = require('../libs/unalib');
const assert = require('assert');

describe('unalib - Suite de Pruebas Unitarias Robustas', function () {

  describe('1. Validación de Números Telefónicos (is_valid_phone)', function () {
    it('debería devolver true para un número válido con guion (8297-8547)', function () {
      assert.strictEqual(val.is_valid_phone('8297-8547'), true);
    });

    it('debería devolver true para formato internacional (+506 8297-8547)', function () {
      assert.strictEqual(val.is_valid_phone('+506 8297-8547'), true);
    });

    it('debería devolver false si contiene caracteres alfabéticos (8297p-8547)', function () {
      assert.strictEqual(val.is_valid_phone('8297p-8547'), false);
    });

    it('debería devolver false para entradas nulas o vacías', function () {
      assert.strictEqual(val.is_valid_phone(''), false);
      assert.strictEqual(val.is_valid_phone(null), false);
    });
  });

  describe('2. Validación de URLs de Imágenes (is_valid_url_image & getImageTag)', function () {
    it('debería devolver true para URL JPG con http (http://image.com/image.jpg)', function () {
      assert.strictEqual(val.is_valid_url_image('http://image.com/image.jpg'), true);
    });

    it('debería devolver true para URL GIF con http (http://image.com/image.gif)', function () {
      assert.strictEqual(val.is_valid_url_image('http://image.com/image.gif'), true);
    });

    it('debería devolver true para URLs PNG y WebP con HTTPS', function () {
      assert.strictEqual(val.is_valid_url_image('https://sub.dominio.org/foto.png'), true);
      assert.strictEqual(val.is_valid_url_image('https://cdn.site.com/avatar.webp?size=large'), true);
    });

    it('debería devolver false para URLs no soportadas o maliciosas', function () {
      assert.strictEqual(val.is_valid_url_image('http://sitio.com/archivo.exe'), false);
      assert.strictEqual(val.is_valid_url_image('javascript:alert(1)'), false);
      assert.strictEqual(val.is_valid_url_image('texto simple sin url'), false);
    });

    it('debería generar la etiqueta <img> segura con atributos correctos', function () {
      const tag = val.getImageTag('https://dominio.com/foto.png');
      assert.ok(tag.startsWith('<img src="https://dominio.com/foto.png"'));
      assert.ok(tag.includes('alt="Imagen compartida"'));
      assert.ok(tag.includes('loading="lazy"'));
    });
  });

  describe('3. Validación de URLs de Videos de YouTube (is_valid_yt_video & getEmbeddedCode)', function () {
    it('debería devolver true para URL estándar de YouTube (watch?v=)', function () {
      assert.strictEqual(val.is_valid_yt_video('https://www.youtube.com/watch?v=qYwlqx-JLok'), true);
    });

    it('debería devolver true para URL corta youtu.be', function () {
      assert.strictEqual(val.is_valid_yt_video('https://youtu.be/qYwlqx-JLok'), true);
    });

    it('debería devolver true para URL embebida y shorts de YouTube', function () {
      assert.strictEqual(val.is_valid_yt_video('https://www.youtube.com/embed/qYwlqx-JLok'), true);
      assert.strictEqual(val.is_valid_yt_video('https://www.youtube.com/shorts/qYwlqx-JLok'), true);
    });

    it('debería extraer correctamente el ID de 11 caracteres del video', function () {
      const id = val.getYTVideoId('https://www.youtube.com/watch?v=qYwlqx-JLok&t=20s');
      assert.strictEqual(id, 'qYwlqx-JLok');
    });

    it('debería generar el código embebido <iframe> con el reproductor de YouTube seguro', function () {
      const embed = val.getEmbeddedCode('https://youtu.be/qYwlqx-JLok');
      assert.ok(embed.startsWith('<iframe width="560" height="315"'));
      assert.ok(embed.includes('src="https://www.youtube.com/embed/qYwlqx-JLok"'));
      assert.ok(embed.includes('allowfullscreen'));
    });

    it('debería devolver false para URLs de videos no válidas o de otros dominios', function () {
      assert.strictEqual(val.is_valid_yt_video('https://vimeo.com/12345678'), false);
      assert.strictEqual(val.is_valid_yt_video('https://youtube.com/watch?v=id_corta'), false);
      assert.strictEqual(val.is_valid_yt_video('javascript:alert(1)'), false);
    });
  });

  describe('4. Prevención de Inyección de Scripts (XSS) y Validación de Mensajes (validateMessage / validarMensaje)', function () {
    it('debería neutralizar <script>alert("Inyección de script");</script> convirtiéndolo a entidades HTML seguras', function () {
      const payload = JSON.stringify({
        nombre: 'Atacante',
        mensaje: "<script>alert('Inyección de script');</script>",
        color: '#ff0000'
      });

      const resultadoJson = val.validateMessage(payload);
      const obj = JSON.parse(resultadoJson);

      assert.strictEqual(obj.tipo, 'texto');
      // Debe contener entidades seguras y NUNCA las etiquetas ejecutables <script>
      assert.strictEqual(obj.mensaje.includes('<script>'), false);
      assert.strictEqual(obj.mensaje.includes('</script>'), false);
      assert.ok(obj.mensaje.includes('&lt;script&gt;'));
      assert.ok(obj.mensaje.includes('&lt;/script&gt;'));
    });

    it('debería neutralizar vectores XSS basados en atributos HTML (ej. <img onerror>)', function () {
      const payload = JSON.stringify({
        nombre: 'Atacante',
        mensaje: '<img src=x onerror=alert(1)>',
        color: '#ff0000'
      });

      const res = JSON.parse(val.validarMensaje(payload));
      assert.strictEqual(res.mensaje.includes('<img src=x onerror='), false);
      assert.ok(res.mensaje.includes('&lt;img'));
    });

    it('debería transformar automáticamente una URL de imagen válida en etiqueta <img>', function () {
      const payload = JSON.stringify({
        nombre: 'Usuario',
        mensaje: 'https://images.unsplash.com/photo-1579783900882-c0d3dad7b119.jpg',
        color: '#00aa00'
      });

      const res = JSON.parse(val.validateMessage(payload));
      assert.strictEqual(res.tipo, 'imagen');
      assert.ok(res.mensaje.includes('<img src="https://images.unsplash.com/photo-1579783900882-c0d3dad7b119.jpg"'));
    });

    it('debería transformar automáticamente una URL de YouTube válida en etiqueta <iframe>', function () {
      const payload = JSON.stringify({
        nombre: 'Usuario',
        mensaje: 'https://www.youtube.com/watch?v=qYwlqx-JLok',
        color: '#0000ff'
      });

      const res = JSON.parse(val.validarMensaje(payload));
      assert.strictEqual(res.tipo, 'video');
      assert.ok(res.mensaje.includes('<iframe'));
      assert.ok(res.mensaje.includes('https://www.youtube.com/embed/qYwlqx-JLok'));
    });

    it('debería sanitizar el nombre de usuario y validar el color hexadecimal para evitar inyección en atributos', function () {
      const payload = JSON.stringify({
        nombre: '<script>alert(1)</script>Juan',
        mensaje: 'Hola a todos',
        color: 'red; background: url(malicious)' // formato inválido
      });

      const res = JSON.parse(val.validateMessage(payload));
      assert.strictEqual(res.nombre.includes('<script>'), false);
      assert.ok(res.nombre.includes('&lt;script&gt;'));
      // El color no válido debe restablecerse al color por defecto seguro
      assert.strictEqual(res.color, '#333333');
    });

    it('debería soportar cadenas de texto simples no formateadas como JSON', function () {
      const res = JSON.parse(val.validarMensaje('Hola mundo seguro'));
      assert.strictEqual(res.mensaje, 'Hola mundo seguro');
      assert.strictEqual(res.nombre, 'Anónimo');
    });
  });

});
