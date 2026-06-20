import { Router } from 'express';
import { authRoutes } from './auth.routes';
import { serviceRoutes } from './services.routes';
import { environmentRoutes } from './environments.routes';
import { pipelineRoutes } from './pipelines.routes';
import { webhookRoutes } from './webhooks.routes';
import { adminRoutes } from './admin.routes';
import { catalogRoutes } from './catalog.routes';

export const apiRouter = Router();

apiRouter.use('/auth', authRoutes);
apiRouter.use('/services', serviceRoutes);
apiRouter.use('/environments', environmentRoutes);
apiRouter.use('/pipelines', pipelineRoutes);
apiRouter.use('/webhooks', webhookRoutes);
apiRouter.use('/admin', adminRoutes);
apiRouter.use('/catalog', catalogRoutes);
