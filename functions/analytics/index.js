import { handle } from '../_lib/analytics-app.js';
export const onRequest = (ctx) => handle(ctx.request, ctx.env);
