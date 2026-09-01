# Convert-IA speech analytics

> Plataforma empresarial para transcribir, analizar y convertir llamadas y conversaciones de WhatsApp en inteligencia accionable.

## Descripción

Convert-IA speech analytics es una aplicación web multi-cuenta que permite a equipos de operación, calidad y estrategia:

- Subir y gestionar grabaciones de llamadas y chats de WhatsApp.
- Transcribir audio a texto con modelos especializados.
- Analizar interacciones con IA para extraer sentimiento, intención, promesas de pago, motivos de contacto y más.
- Visualizar métricas unificadas en dashboards interactivos.
- Generar reportes ejecutivos y exportar datos en múltiples formatos.
- Administrar usuarios, roles, permisos y límites de consumo por cuenta.

## Características principales

- Ingesta manual y automatizada vía SFTP.
- Transcripción con diarización de agente/cliente.
- Análisis con prompts personalizables y comparación de versiones.
- Analítica unificada de llamadas y WhatsApp.
- Reportes estratégicos con presentaciones ejecutivas.
- Gestión de usuarios, cuentas y matriz de permisos (RBAC).
- Auditoría completa de acciones y cambios.

## Tecnologías

- Frontend: React 18 + Vite + TypeScript + Tailwind CSS + shadcn/ui
- Backend: Supabase (PostgreSQL, Auth, Edge Functions, Storage, Realtime)
- AI: Lovable AI Gateway con modelos de transcripción y análisis

## Entorno

El proyecto requiere las variables de entorno configuradas en `.env` para el cliente y los secretos de Supabase para las Edge Functions. No incluya credenciales en el repositorio.

## Desarrollo local

```bash
npm install
npm run dev
```

## Tests

```bash
npm run test
```

## Licencia

Propio / confidencial — Convert-IA.
