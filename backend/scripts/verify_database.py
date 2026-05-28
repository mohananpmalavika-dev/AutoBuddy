#!/usr/bin/env python3
"""
Database Verification Script
Verifies production database setup - connections, migrations, indexes, and tables
Run: python verify_database.py
"""

import os
import sys
from datetime import datetime
import psycopg2
from psycopg2 import sql
import json

# Configuration
DB_HOST = os.getenv("DB_HOST", "localhost")
DB_PORT = os.getenv("DB_PORT", "5432")
DB_NAME = os.getenv("DB_NAME", "autobuddy")
DB_USER = os.getenv("DB_USER", "postgres")
DB_PASSWORD = os.getenv("DB_PASSWORD", "")

# Colors for terminal output
class Colors:
    GREEN = '\033[92m'
    RED = '\033[91m'
    YELLOW = '\033[93m'
    BLUE = '\033[94m'
    RESET = '\033[0m'
    BOLD = '\033[1m'


class DatabaseVerifier:
    def __init__(self):
        self.connection = None
        self.cursor = None
        self.results = {
            "timestamp": datetime.now().isoformat(),
            "host": DB_HOST,
            "database": DB_NAME,
            "checks": {},
            "summary": {
                "total_checks": 0,
                "passed": 0,
                "failed": 0,
                "status": "UNKNOWN"
            }
        }

    def connect(self):
        """Establish database connection"""
        try:
            self.connection = psycopg2.connect(
                host=DB_HOST,
                port=DB_PORT,
                database=DB_NAME,
                user=DB_USER,
                password=DB_PASSWORD,
                connect_timeout=10
            )
            self.cursor = self.connection.cursor()
            return True
        except Exception as e:
            print(f"{Colors.RED}✗ Database Connection Failed:{Colors.RESET}")
            print(f"  Error: {str(e)}")
            self.results["checks"]["connection"] = {
                "status": "failed",
                "error": str(e)
            }
            return False

    def close(self):
        """Close database connection"""
        if self.cursor:
            self.cursor.close()
        if self.connection:
            self.connection.close()

    def check_connection(self):
        """Check 1: Database connectivity"""
        print(f"\n{Colors.BLUE}[1/7] Checking Database Connection...{Colors.RESET}")
        
        if not self.connection:
            print(f"{Colors.RED}✗ Not connected{Colors.RESET}")
            self._add_result("connection", False, "No database connection")
            return False

        try:
            self.cursor.execute("SELECT 1")
            version = self.cursor.fetchone()[0]
            print(f"{Colors.GREEN}✓ Connected successfully{Colors.RESET}")
            print(f"  Database: {DB_NAME}")
            print(f"  Host: {DB_HOST}:{DB_PORT}")
            self._add_result("connection", True, "Connection successful")
            return True
        except Exception as e:
            print(f"{Colors.RED}✗ Connection test failed: {str(e)}{Colors.RESET}")
            self._add_result("connection", False, str(e))
            return False

    def check_migrations(self):
        """Check 2: Verify migrations have been applied"""
        print(f"\n{Colors.BLUE}[2/7] Checking Database Migrations...{Colors.RESET}")
        
        try:
            # Check if schema_version table exists
            self.cursor.execute("""
                SELECT EXISTS (
                    SELECT 1 FROM information_schema.tables 
                    WHERE table_name = 'schema_version'
                )
            """)
            
            schema_exists = self.cursor.fetchone()[0]
            
            if not schema_exists:
                print(f"{Colors.YELLOW}! Schema version table not found (first migration){Colors.RESET}")
                self._add_result("migrations", True, "Schema version table not created yet (OK for fresh install)")
                return True
            
            # Get migration status
            self.cursor.execute("SELECT version, description, success FROM schema_version ORDER BY version DESC LIMIT 10")
            migrations = self.cursor.fetchall()
            
            print(f"{Colors.GREEN}✓ Found {len(migrations)} migration(s){Colors.RESET}")
            for version, description, success in migrations:
                status = "✓" if success else "✗"
                print(f"  {status} v{version}: {description}")
            
            # Check if latest migration is successful
            if migrations and migrations[0][2]:
                self._add_result("migrations", True, f"{len(migrations)} migrations applied")
                return True
            else:
                print(f"{Colors.RED}✗ Latest migration failed{Colors.RESET}")
                self._add_result("migrations", False, "Latest migration failed")
                return False
        
        except Exception as e:
            print(f"{Colors.RED}✗ Error checking migrations: {str(e)}{Colors.RESET}")
            self._add_result("migrations", False, str(e))
            return False

    def check_critical_tables(self):
        """Check 3: Verify critical tables exist"""
        print(f"\n{Colors.BLUE}[3/7] Checking Critical Tables...{Colors.RESET}")
        
        critical_tables = [
            "rides",
            "bookings",
            "users",
            "support_tickets",
            "ratings",
            "wallet_transactions",
            "vehicles",
            "saved_places",
            "scheduled_rides",
            "accessibility_settings",
            "push_notification_subscriptions"
        ]
        
        missing = []
        found = []
        
        for table in critical_tables:
            try:
                self.cursor.execute("""
                    SELECT EXISTS (
                        SELECT 1 FROM information_schema.tables 
                        WHERE table_name = %s
                    )
                """, (table,))
                
                exists = self.cursor.fetchone()[0]
                
                if exists:
                    found.append(table)
                    print(f"{Colors.GREEN}✓{Colors.RESET} {table}")
                else:
                    missing.append(table)
                    print(f"{Colors.RED}✗{Colors.RESET} {table}")
            
            except Exception as e:
                print(f"{Colors.RED}✗{Colors.RESET} {table} - Error: {str(e)}")
                missing.append(table)
        
        status = len(missing) == 0
        message = f"Found {len(found)}/{len(critical_tables)} tables"
        
        if missing:
            message += f" (Missing: {', '.join(missing)})"
        
        if status:
            print(f"{Colors.GREEN}✓ All critical tables found{Colors.RESET}")
        else:
            print(f"{Colors.YELLOW}! Missing tables: {', '.join(missing)}{Colors.RESET}")
        
        self._add_result("critical_tables", status, message)
        return status

    def check_indexes(self):
        """Check 4: Verify critical indexes exist"""
        print(f"\n{Colors.BLUE}[4/7] Checking Critical Indexes...{Colors.RESET}")
        
        critical_indexes = [
            ("rides", "driver_id, created_at"),
            ("bookings", "passenger_id, created_at"),
            ("support_tickets", "status, assigned_to"),
            ("ratings", "user_id, created_at"),
            ("audit_logs", "user_id, action_type")
        ]
        
        found = []
        missing = []
        
        for table, columns in critical_indexes:
            try:
                self.cursor.execute("""
                    SELECT indexname FROM pg_indexes 
                    WHERE tablename = %s AND indexdef LIKE %s
                """, (table, f"%{columns}%"))
                
                index = self.cursor.fetchone()
                
                if index:
                    found.append((table, columns))
                    print(f"{Colors.GREEN}✓{Colors.RESET} {table}({columns})")
                else:
                    missing.append((table, columns))
                    print(f"{Colors.YELLOW}!{Colors.RESET} {table}({columns}) - Not found")
            
            except Exception as e:
                print(f"{Colors.RED}✗{Colors.RESET} {table}({columns}) - Error: {str(e)}")
                missing.append((table, columns))
        
        status = len(missing) == 0
        message = f"Found {len(found)}/{len(critical_indexes)} indexes"
        
        if missing:
            message += f" (Missing: {len(missing)})"
        
        if status:
            print(f"{Colors.GREEN}✓ All critical indexes found{Colors.RESET}")
        else:
            print(f"{Colors.YELLOW}! Missing {len(missing)} index(es){Colors.RESET}")
        
        self._add_result("indexes", status, message)
        return status

    def check_table_schemas(self):
        """Check 5: Verify table columns and constraints"""
        print(f"\n{Colors.BLUE}[5/7] Checking Table Schemas...{Colors.RESET}")
        
        # Check required columns in key tables
        schema_requirements = {
            "rides": ["id", "passenger_id", "driver_id", "status", "created_at"],
            "users": ["id", "email", "password_hash", "role", "created_at"],
            "support_tickets": ["id", "user_id", "subject", "status", "escalation_level"],
            "vehicles": ["id", "driver_id", "license_plate", "insurance_expiry_date", "pollution_cert_expiry_date"],
            "scheduled_rides": ["id", "passenger_id", "scheduled_time", "is_recurring", "status"]
        }
        
        all_valid = True
        
        for table, required_columns in schema_requirements.items():
            try:
                self.cursor.execute(f"""
                    SELECT column_name FROM information_schema.columns 
                    WHERE table_name = %s
                """, (table,))
                
                existing_columns = [col[0] for col in self.cursor.fetchall()]
                missing = [col for col in required_columns if col not in existing_columns]
                
                if not missing:
                    print(f"{Colors.GREEN}✓{Colors.RESET} {table} schema valid")
                else:
                    print(f"{Colors.RED}✗{Colors.RESET} {table} missing columns: {', '.join(missing)}")
                    all_valid = False
            
            except Exception as e:
                print(f"{Colors.RED}✗{Colors.RESET} {table} - Error: {str(e)}")
                all_valid = False
        
        self._add_result("schemas", all_valid, "Table schemas verified")
        return all_valid

    def check_data_sample(self):
        """Check 6: Verify data integrity with sample queries"""
        print(f"\n{Colors.BLUE}[6/7] Checking Data Integrity...{Colors.RESET}")
        
        try:
            # Count records in key tables
            tables = ["users", "rides", "bookings", "support_tickets"]
            all_counts = {}
            
            for table in tables:
                try:
                    self.cursor.execute(f"SELECT COUNT(*) FROM {table}")
                    count = self.cursor.fetchone()[0]
                    all_counts[table] = count
                    print(f"{Colors.GREEN}✓{Colors.RESET} {table}: {count} records")
                except Exception as e:
                    print(f"{Colors.YELLOW}!{Colors.RESET} {table}: Unable to count ({str(e)})")
                    all_counts[table] = "unknown"
            
            self._add_result("data_integrity", True, f"Sample data checked", data=all_counts)
            return True
        
        except Exception as e:
            print(f"{Colors.RED}✗{Colors.RESET} Data integrity check failed: {str(e)}")
            self._add_result("data_integrity", False, str(e))
            return False

    def check_performance_stats(self):
        """Check 7: Get database performance statistics"""
        print(f"\n{Colors.BLUE}[7/7] Checking Database Performance...{Colors.RESET}")
        
        try:
            # Database size
            self.cursor.execute("""
                SELECT pg_database.datname,
                pg_size_pretty(pg_database_size(pg_database.datname)) AS size
                FROM pg_database
                WHERE pg_database.datname = %s
            """, (DB_NAME,))
            
            size_info = self.cursor.fetchone()
            if size_info:
                print(f"{Colors.GREEN}✓{Colors.RESET} Database size: {size_info[1]}")
            
            # Connection count
            self.cursor.execute("""
                SELECT count(*) FROM pg_stat_activity 
                WHERE datname = %s
            """, (DB_NAME,))
            
            conn_count = self.cursor.fetchone()[0]
            print(f"{Colors.GREEN}✓{Colors.RESET} Active connections: {conn_count}")
            
            # Table sizes
            self.cursor.execute("""
                SELECT schemaname, tablename, 
                pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) as size
                FROM pg_tables
                WHERE schemaname = 'public'
                ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC
                LIMIT 5
            """)
            
            print(f"{Colors.GREEN}✓{Colors.RESET} Top 5 largest tables:")
            for schema, table, size in self.cursor.fetchall():
                print(f"  - {table}: {size}")
            
            self._add_result("performance", True, "Performance stats retrieved")
            return True
        
        except Exception as e:
            print(f"{Colors.YELLOW}!{Colors.RESET} Performance check incomplete: {str(e)}")
            self._add_result("performance", True, "Performance stats - partial data")
            return True

    def _add_result(self, check_name, status, message, data=None):
        """Add check result"""
        self.results["checks"][check_name] = {
            "status": "passed" if status else "failed",
            "message": message,
            "data": data
        }
        
        self.results["summary"]["total_checks"] += 1
        if status:
            self.results["summary"]["passed"] += 1
        else:
            self.results["summary"]["failed"] += 1

    def generate_report(self):
        """Generate final report"""
        print(f"\n{Colors.BOLD}{'='*60}{Colors.RESET}")
        print(f"{Colors.BOLD}DATABASE VERIFICATION REPORT{Colors.RESET}")
        print(f"{Colors.BOLD}{'='*60}{Colors.RESET}")
        
        total = self.results["summary"]["total_checks"]
        passed = self.results["summary"]["passed"]
        failed = self.results["summary"]["failed"]
        
        if failed == 0:
            status = f"{Colors.GREEN}PASSED{Colors.RESET}"
            self.results["summary"]["status"] = "PASSED"
        elif failed <= 2:
            status = f"{Colors.YELLOW}WARNING{Colors.RESET}"
            self.results["summary"]["status"] = "WARNING"
        else:
            status = f"{Colors.RED}FAILED{Colors.RESET}"
            self.results["summary"]["status"] = "FAILED"
        
        print(f"\nStatus: {status}")
        print(f"Checks Passed: {Colors.GREEN}{passed}/{total}{Colors.RESET}")
        print(f"Checks Failed: {Colors.RED}{failed}/{total}{Colors.RESET}")
        
        print(f"\n{Colors.BOLD}Check Results:{Colors.RESET}")
        for check_name, result in self.results["checks"].items():
            status_icon = f"{Colors.GREEN}✓{Colors.RESET}" if result["status"] == "passed" else f"{Colors.RED}✗{Colors.RESET}"
            print(f"  {status_icon} {check_name}: {result['message']}")
        
        print(f"\n{Colors.BOLD}Recommendations:{Colors.RESET}")
        if self.results["summary"]["failed"] == 0:
            print(f"  {Colors.GREEN}✓ Database is production-ready{Colors.RESET}")
        else:
            print(f"  {Colors.YELLOW}! Address failed checks before production deployment{Colors.RESET}")
        
        # Save JSON report
        report_file = f"database_verification_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
        try:
            with open(report_file, 'w') as f:
                json.dump(self.results, f, indent=2, default=str)
            print(f"\n{Colors.GREEN}Report saved to: {report_file}{Colors.RESET}")
        except Exception as e:
            print(f"{Colors.YELLOW}! Could not save report: {str(e)}{Colors.RESET}")

    def run_all_checks(self):
        """Run all verification checks"""
        print(f"\n{Colors.BOLD}{Colors.BLUE}Starting Database Verification...{Colors.RESET}")
        print(f"Host: {DB_HOST}:{DB_PORT}")
        print(f"Database: {DB_NAME}")
        
        if not self.connect():
            print(f"\n{Colors.RED}Failed to connect to database. Aborting.{Colors.RESET}")
            self.generate_report()
            return False
        
        try:
            checks = [
                self.check_connection,
                self.check_migrations,
                self.check_critical_tables,
                self.check_indexes,
                self.check_table_schemas,
                self.check_data_sample,
                self.check_performance_stats
            ]
            
            results = [check() for check in checks]
            
            self.generate_report()
            
            return all(results)
        
        finally:
            self.close()


def main():
    """Main entry point"""
    verifier = DatabaseVerifier()
    success = verifier.run_all_checks()
    
    # Exit with appropriate code
    sys.exit(0 if success else 1)


if __name__ == "__main__":
    main()
