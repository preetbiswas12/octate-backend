"use strict";
/**
 * Health check endpoint for monitoring backend status
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = healthHandler;
const supabase_1 = require("../lib/supabase");
const utils_1 = require("../lib/utils");
const startTime = Date.now();
async function healthHandler(req, res) {
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
        utils_1.logger.info('Health check requested');
        // Check database connectivity
        const databaseHealthy = await (0, supabase_1.checkSupabaseConnection)();
        // Check realtime connectivity
        let realtimeHealthy = false;
        try {
            const channel = supabase_1.supabase.channel('health-check');
            await new Promise((resolve, reject) => {
                const timeout = setTimeout(() => reject(new Error('Timeout')), 2000);
                channel
                    .on('broadcast', { event: 'test' }, () => {
                    clearTimeout(timeout);
                    realtimeHealthy = true;
                    resolve(true);
                })
                    .subscribe((status) => {
                    if (status === 'SUBSCRIBED') {
                        channel.send({
                            type: 'broadcast',
                            event: 'test',
                            payload: { test: true },
                        });
                    }
                });
            });
            await supabase_1.supabase.removeChannel(channel);
        }
        catch (error) {
            utils_1.logger.warn('Realtime health check failed', error);
            realtimeHealthy = false;
        }
        // Check auth service
        let authHealthy = false;
        try {
            const { data } = await supabase_1.supabase.auth.getSession();
            authHealthy = true; // If no error, auth service is responsive
        }
        catch (error) {
            utils_1.logger.warn('Auth health check failed', error);
            authHealthy = false;
        }
        // Calculate overall status
        const healthyServices = [databaseHealthy, realtimeHealthy, authHealthy].filter(Boolean).length;
        const totalServices = 3;
        let status;
        if (healthyServices === totalServices) {
            status = 'healthy';
        }
        else if (healthyServices >= totalServices / 2) {
            status = 'degraded';
        }
        else {
            status = 'unhealthy';
        }
        const healthStatus = {
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
        utils_1.logger.info('Health check completed', { status, services: healthStatus.services });
        return res.status(statusCode).json(healthStatus);
    }
    catch (error) {
        utils_1.logger.error('Health check failed', error);
        const errorStatus = {
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
//# sourceMappingURL=health.js.map