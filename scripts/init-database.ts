#!/usr/bin/env ts-node

/**
 * Database initialization script for Octate collaboration backend
 * This script creates all necessary tables and indexes in Supabase
 */

import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
    console.error('❌ Missing Supabase environment variables');
    console.error('Required: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY');
    process.exit(1);
}

console.log('🔧 Initializing Octate collaboration database...');
console.log(`📍 Supabase URL: ${supabaseUrl}`);

// Create admin client
const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function initializeDatabase() {
    try {
        console.log('📋 Reading schema file...');
        
        // Read the schema file
        const schemaPath = path.join(__dirname, '..', 'supabase', 'schema.sql');
        const schema = fs.readFileSync(schemaPath, 'utf8');
        
        // Split into individual statements
        const statements = schema
            .split(';')
            .map(stmt => stmt.trim())
            .filter(stmt => stmt.length > 0 && !stmt.startsWith('--'));
        
        console.log(`🔨 Executing ${statements.length} SQL statements...`);
        
        // Execute each statement
        for (let i = 0; i < statements.length; i++) {
            const statement = statements[i];
            if (statement.length === 0) continue;
            
            console.log(`   ${i + 1}/${statements.length}: ${statement.substring(0, 50)}...`);
            
            const { error } = await supabase.rpc('exec_sql', { 
                sql_statement: statement + ';' 
            });
            
            if (error) {
                // Some errors are expected (like "already exists")
                if (error.message.includes('already exists') || 
                    error.message.includes('already installed') ||
                    error.message.includes('already created')) {
                    console.log(`   ⚠️  Skipping (already exists): ${error.message}`);
                } else {
                    console.error(`   ❌ Error executing statement: ${error.message}`);
                    // Continue with other statements
                }
            } else {
                console.log(`   ✅ Success`);
            }
        }
        
        console.log('🎯 Testing database tables...');
        
        // Test that all main tables exist
        const tables = ['rooms', 'participants', 'documents', 'operations', 'cursors', 'presence'];
        
        for (const table of tables) {
            const { data, error } = await supabase
                .from(table)
                .select('*')
                .limit(1);
                
            if (error) {
                console.error(`❌ Table '${table}' test failed:`, error.message);
            } else {
                console.log(`✅ Table '${table}' is accessible`);
            }
        }
        
        console.log('🚀 Database initialization complete!');
        console.log('🔗 Test your connection: GET /health');
        
    } catch (error) {
        console.error('❌ Database initialization failed:', error);
        process.exit(1);
    }
}

// Alternative method using direct SQL execution
async function initializeDatabaseDirect() {
    try {
        console.log('📋 Reading schema file...');
        
        const schemaPath = path.join(__dirname, '..', 'supabase', 'schema.sql');
        const schema = fs.readFileSync(schemaPath, 'utf8');
        
        console.log('🔨 Executing schema directly...');
        
        // Try to execute the full schema
        const { data, error } = await supabase.rpc('exec_sql', { 
            sql_statement: schema 
        });
        
        if (error) {
            console.error('❌ Schema execution failed:', error.message);
            console.log('🔄 Falling back to statement-by-statement execution...');
            return await initializeDatabase();
        }
        
        console.log('✅ Schema executed successfully');
        
        // Test connection
        const { data: testData, error: testError } = await supabase
            .from('rooms')
            .select('id')
            .limit(1);
            
        if (testError) {
            console.error('❌ Connection test failed:', testError.message);
        } else {
            console.log('✅ Database connection verified');
        }
        
        console.log('🚀 Database initialization complete!');
        
    } catch (error) {
        console.error('❌ Direct initialization failed:', error);
        return await initializeDatabase();
    }
}

// Run initialization
if (require.main === module) {
    initializeDatabaseDirect()
        .then(() => process.exit(0))
        .catch((error) => {
            console.error('❌ Initialization failed:', error);
            process.exit(1);
        });
}

export { initializeDatabase, initializeDatabaseDirect };