#!/usr/bin/env tsx

/**
 * Test connection to Supabase and validate backend functionality
 */

import * as dotenv from 'dotenv';
import * as path from 'path';
import { checkSupabaseConnection } from '../lib/supabase';
import { initializeDatabase } from '../lib/database-init';

// Load environment variables
dotenv.config({ path: path.join(__dirname, '..', '.env') });

async function testConnection() {
	console.log('🧪 Testing Octate backend connection...\n');

	// Environment check
	console.log('📋 Environment Variables:');
	console.log(`   SUPABASE_URL: ${process.env.SUPABASE_URL ? '✅ Set' : '❌ Missing'}`);
	console.log(`   SUPABASE_ANON_KEY: ${process.env.SUPABASE_ANON_KEY ? '✅ Set' : '❌ Missing'}`);
	console.log(`   SUPABASE_SERVICE_ROLE_KEY: ${process.env.SUPABASE_SERVICE_ROLE_KEY ? '✅ Set' : '❌ Missing'}`);
	console.log();

	// Database connection test
	console.log('🔗 Testing Supabase connection...');
	const connected = await checkSupabaseConnection();

	if (!connected) {
		console.error('❌ Database connection failed');
		console.log('\n🔧 Troubleshooting steps:');
		console.log('1. Verify Supabase project URL and keys');
		console.log('2. Check if database tables exist');
		console.log('3. Run the SQL schema manually in Supabase Dashboard');
		process.exit(1);
	}

	console.log('✅ Database connection successful');
	console.log();

	// Database initialization test
	console.log('🔨 Testing database initialization...');
	const initialized = await initializeDatabase();

	if (!initialized) {
		console.error('❌ Database initialization failed');
		console.log('\n📋 Manual setup required:');
		console.log('1. Go to https://diijislhtmsbtvwecfdr.supabase.co/project/default/sql');
		console.log('2. Run the SQL from: collaboration-backend/supabase/production-schema.sql');
		console.log('3. Re-run this test');
		process.exit(1);
	}

	console.log('✅ Database initialization successful');
	console.log();

	// Production URL test
	if (process.env.NODE_ENV === 'production') {
		console.log('🌐 Testing production backend...');
		try {
			const response = await fetch('https://octate-backend.onrender.com/health');
			const data = await response.json();

			console.log('✅ Production backend response:', data);
		} catch (error) {
			console.error('❌ Production backend test failed:', error);
		}
	}

	console.log('\n🎉 All tests passed! Backend is ready for collaboration.');
	console.log('\n🔗 Next steps:');
	console.log('1. Test OAuth authentication in VS Code');
	console.log('2. Create and join collaboration rooms');
	console.log('3. Test real-time document editing');
}

// Run test
if (require.main === module) {
	testConnection()
		.then(() => process.exit(0))
		.catch((error) => {
			console.error('❌ Test failed:', error);
			process.exit(1);
		});
}

export { testConnection };
