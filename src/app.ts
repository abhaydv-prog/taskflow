import express from 'express';
import cors from 'cors';
import authRoutes from './routes/authRoutes';
import projectRoutes from './routes/projectRoutes';
import taskItemRoutes from './routes/taskItemRoutes';
import { errorHandler } from './middleware/errorHandler';

export const app = express();

app.use(cors());
app.use(express.json());

app.get('/health', (_req, res) => res.json({ status: 'ok' }));

app.use('/auth', authRoutes);
app.use('/projects', projectRoutes);
app.use('/tasks', taskItemRoutes);

// Error handler must be registered LAST — after all routes.
app.use(errorHandler);