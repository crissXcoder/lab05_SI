# ==============================================================================
# Dockerfile: Contenerización Segura de UNA Chat
# Laboratorio de Monitoreo de Logs - Seguridad Informática UNA
# ==============================================================================

# Imagen base oficial ligera de Node.js v24 basada en Alpine
FROM node:24-alpine

# Directorio de trabajo de la aplicación
WORKDIR /app

# Copia de manifiestos de dependencias para caché eficiente de capas
COPY package*.json ./

# Instalación limpia de dependencias de producción
RUN npm ci --omit=dev

# Copia de archivos de aplicación
COPY . .

# Exposición del puerto del servicio
EXPOSE 3000

# Variables de entorno por defecto
ENV NODE_ENV=production
ENV PORT=3000

# Comando de inicio definido en el proyecto
CMD ["npm", "start"]

