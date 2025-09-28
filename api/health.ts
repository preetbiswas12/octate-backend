/**
 * Health check endpoint for monitoring backend status
 */

import { VercelRequest, VercelResponse } from '@vercel/node';
import { supabase, checkSupabaseConnection } from '../lib/supabase';
import { logger, performHealthCheck } from '../lib/utils';

interface HealthStatus {
	status: 'healthy' | 'degraded' | 'unhealthy';
	timestamp: string;
	version: string;
	services: {
		database: boolean;
		realtime: boolean;
		auth: boolean;
	};
	uptime: number;
	environment: string;
}

const startTime = Date.now();

export default async function healthHandler(
	req: VercelRequest,
	res: VercelResponse
) {
	// Set CORS headers
	res.setHeader('Access-Control-Allow-Origin', '*');
	res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
	res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

	if (req.method === 'OPTIONS') {
		return res.status(200).end();
	}

	if (req.method !== 'GET') {
		return res.status(405).json({
			error: 'Method not allowed',
			message: 'Only GET requests are supported',
		});
	}

	try {
		logger.info('Health check requested');

		// Check database connectivity
		const databaseHealthy = await checkSupabaseConnection();

		// Check realtime connectivity
		let realtimeHealthy = false;
		try {
			const channel = supabase.channel('health-check');
			await new Promise((resolve, reject) => {
				const timeout = setTimeout(() => reject(new Error('Timeout')), 2000);

				channel
					.on('broadcast', { event: 'test' }, () => {
						clearTimeout(timeout);
						realtimeHealthy = true;
						resolve(true);
					})
					.subscribe((status: string) => {
						if (status === 'SUBSCRIBED') {
							channel.send({
								type: 'broadcast',
								event: 'test',
								payload: { test: true },
							});
						}
					});
			});

			await supabase.removeChannel(channel);
		} catch (error) {
			logger.warn('Realtime health check failed', error as Error);
			realtimeHealthy = false;
		}

		// Check auth service
		let authHealthy = false;
		try {
			const { data } = await supabase.auth.getSession();
			authHealthy = true; // If no error, auth service is responsive
		} catch (error) {
			logger.warn('Auth health check failed', error as Error);
			authHealthy = false;
		}

		// Calculate overall status
		const healthyServices = [databaseHealthy, realtimeHealthy, authHealthy].filter(Boolean).length;
		const totalServices = 3;

		let status: HealthStatus['status'];
		if (healthyServices === totalServices) {
			status = 'healthy';
		} else if (healthyServices >= totalServices / 2) {
			status = 'degraded';
		} else {
			status = 'unhealthy';
		}

		const healthStatus: HealthStatus = {
			status,
			timestamp: new Date().toISOString(),
			version: process.env.npm_package_version || '1.0.0',
			services: {
				database: databaseHealthy,
				realtime: realtimeHealthy,
				auth: authHealthy,
			},
			uptime: Date.now() - startTime,
			environment: process.env.NODE_ENV || 'development',
		};

		// Set appropriate status code
		const statusCode = status === 'healthy' ? 200 : status === 'degraded' ? 200 : 503;

		logger.info('Health check completed', { status, services: healthStatus.services });

		return res.status(statusCode).json(healthStatus);

	} catch (error) {
		logger.error('Health check failed', error as Error);

		const errorStatus: HealthStatus = {
			status: 'unhealthy',
			timestamp: new Date().toISOString(),
			version: process.env.npm_package_version || '1.0.0',
			services: {
				database: false,
				realtime: false,
				auth: false,
			},
			uptime: Date.now() - startTime,
			environment: process.env.NODE_ENV || 'development',
		};

		return res.status(503).json(errorStatus);
	}
}
