#!/usr/bin/env python3
"""
Navixy Dashboard Backend API Testing
Tests all API endpoints for the Navixy fleet management dashboard
"""

import requests
import sys
import json
from datetime import datetime, timedelta
from typing import Dict, Any, List

class NavixyAPITester:
    def __init__(self, base_url="https://iot-navixy-logic.preview.emergentagent.com"):
        self.base_url = base_url
        self.api_url = f"{base_url}/api"
        self.tests_run = 0
        self.tests_passed = 0
        self.failed_tests = []
        self.session = requests.Session()
        self.session.headers.update({'Content-Type': 'application/json'})

    def log_test(self, name: str, success: bool, details: str = ""):
        """Log test result"""
        self.tests_run += 1
        if success:
            self.tests_passed += 1
            print(f"✅ {name} - PASSED")
        else:
            print(f"❌ {name} - FAILED: {details}")
            self.failed_tests.append({"test": name, "error": details})

    def test_api_root(self) -> bool:
        """Test API root endpoint"""
        try:
            response = self.session.get(f"{self.api_url}/")
            success = response.status_code == 200
            if success:
                data = response.json()
                success = "Navixy Fleet Dashboard API" in data.get("message", "")
            self.log_test("API Root", success, f"Status: {response.status_code}")
            return success
        except Exception as e:
            self.log_test("API Root", False, str(e))
            return False

    def test_trackers_endpoint(self) -> Dict[str, Any]:
        """Test /api/trackers endpoint"""
        try:
            response = self.session.get(f"{self.api_url}/trackers")
            success = response.status_code == 200
            data = response.json() if success else {}
            
            if success and data.get('success'):
                trackers = data.get('trackers', [])
                success = len(trackers) > 0
                self.log_test("Trackers API", success, f"Found {len(trackers)} trackers")
                return {"success": True, "count": len(trackers), "data": data}
            else:
                error_msg = data.get('error', f"HTTP {response.status_code}")
                self.log_test("Trackers API", False, error_msg)
                return {"success": False, "error": error_msg}
        except Exception as e:
            self.log_test("Trackers API", False, str(e))
            return {"success": False, "error": str(e)}

    def test_employees_endpoint(self) -> Dict[str, Any]:
        """Test /api/employees endpoint"""
        try:
            response = self.session.get(f"{self.api_url}/employees")
            success = response.status_code == 200
            data = response.json() if success else {}
            
            if success and data.get('success'):
                employees = data.get('employees', [])
                self.log_test("Employees API", True, f"Found {len(employees)} employees")
                return {"success": True, "count": len(employees), "data": data}
            else:
                error_msg = data.get('error', f"HTTP {response.status_code}")
                self.log_test("Employees API", False, error_msg)
                return {"success": False, "error": error_msg}
        except Exception as e:
            self.log_test("Employees API", False, str(e))
            return {"success": False, "error": str(e)}

    def test_fleet_stats_endpoint(self) -> Dict[str, Any]:
        """Test /api/fleet/stats endpoint"""
        try:
            today = datetime.now().strftime('%Y-%m-%d')
            params = {'from_date': today, 'to_date': today}
            
            response = self.session.get(f"{self.api_url}/fleet/stats", params=params)
            success = response.status_code == 200
            data = response.json() if success else {}
            
            if success and data.get('success'):
                summary = data.get('summary', {})
                vehicles = data.get('vehicles', [])
                self.log_test("Fleet Stats API", True, 
                            f"Total vehicles: {summary.get('total_vehicles', 0)}, "
                            f"Avg efficiency: {summary.get('average_efficiency', 0)}%")
                return {"success": True, "summary": summary, "vehicles_count": len(vehicles)}
            else:
                error_msg = data.get('error', f"HTTP {response.status_code}")
                self.log_test("Fleet Stats API", False, error_msg)
                return {"success": False, "error": error_msg}
        except Exception as e:
            self.log_test("Fleet Stats API", False, str(e))
            return {"success": False, "error": str(e)}

    def test_fleet_efficiency_endpoint(self) -> Dict[str, Any]:
        """Test /api/fleet/efficiency endpoint"""
        try:
            today = datetime.now().strftime('%Y-%m-%d')
            params = {'date': today, 'period': 'day'}
            
            response = self.session.get(f"{self.api_url}/fleet/efficiency", params=params)
            success = response.status_code == 200
            data = response.json() if success else {}
            
            if success and data.get('success'):
                summary = data.get('summary', {})
                vehicles = data.get('vehicles', [])
                self.log_test("Fleet Efficiency API", True, 
                            f"Avg efficiency: {summary.get('average_efficiency', 0)}%, "
                            f"Vehicles: {len(vehicles)}")
                return {"success": True, "summary": summary, "vehicles_count": len(vehicles)}
            else:
                error_msg = data.get('error', f"HTTP {response.status_code}")
                self.log_test("Fleet Efficiency API", False, error_msg)
                return {"success": False, "error": error_msg}
        except Exception as e:
            self.log_test("Fleet Efficiency API", False, str(e))
            return {"success": False, "error": str(e)}

    def test_driver_report_endpoint(self) -> Dict[str, Any]:
        """Test /api/reports/driver endpoint"""
        try:
            today = datetime.now().strftime('%Y-%m-%d')
            week_ago = (datetime.now() - timedelta(days=7)).strftime('%Y-%m-%d')
            params = {'from_date': week_ago, 'to_date': today}
            
            response = self.session.get(f"{self.api_url}/reports/driver", params=params)
            success = response.status_code == 200
            data = response.json() if success else {}
            
            if success and data.get('success'):
                drivers = data.get('drivers', [])
                self.log_test("Driver Report API", True, f"Found {len(drivers)} drivers")
                return {"success": True, "drivers_count": len(drivers), "data": data}
            else:
                error_msg = data.get('error', f"HTTP {response.status_code}")
                self.log_test("Driver Report API", False, error_msg)
                return {"success": False, "error": error_msg}
        except Exception as e:
            self.log_test("Driver Report API", False, str(e))
            return {"success": False, "error": str(e)}

    def test_flows_endpoints(self) -> Dict[str, Any]:
        """Test IoT flows CRUD endpoints"""
        results = {"get": False, "create": False, "update": False, "delete": False}
        
        # Test GET flows
        try:
            response = self.session.get(f"{self.api_url}/flows")
            if response.status_code == 200:
                data = response.json()
                if data.get('success'):
                    flows = data.get('flows', [])
                    results["get"] = True
                    self.log_test("Flows GET", True, f"Found {len(flows)} flows")
                else:
                    self.log_test("Flows GET", False, "API returned success=false")
            else:
                self.log_test("Flows GET", False, f"HTTP {response.status_code}")
        except Exception as e:
            self.log_test("Flows GET", False, str(e))

        # Test CREATE flow
        try:
            test_flow = {
                "name": f"Test Flow {datetime.now().strftime('%H%M%S')}",
                "nodes": [
                    {"id": "test-1", "type": "data_source", "label": "Test Input", "position": {"x": 100, "y": 100}}
                ],
                "connections": []
            }
            
            response = self.session.post(f"{self.api_url}/flows", json=test_flow)
            if response.status_code == 200:
                data = response.json()
                if data.get('success'):
                    results["create"] = True
                    flow_id = data.get('flow', {}).get('id')
                    self.log_test("Flows CREATE", True, f"Created flow ID: {flow_id}")
                    
                    # Test UPDATE if create succeeded
                    if flow_id:
                        try:
                            updated_flow = test_flow.copy()
                            updated_flow["name"] = f"Updated {test_flow['name']}"
                            
                            response = self.session.put(f"{self.api_url}/flows/{flow_id}", json=updated_flow)
                            if response.status_code == 200:
                                results["update"] = True
                                self.log_test("Flows UPDATE", True, f"Updated flow {flow_id}")
                            else:
                                self.log_test("Flows UPDATE", False, f"HTTP {response.status_code}")
                        except Exception as e:
                            self.log_test("Flows UPDATE", False, str(e))
                        
                        # Test DELETE
                        try:
                            response = self.session.delete(f"{self.api_url}/flows/{flow_id}")
                            if response.status_code == 200:
                                results["delete"] = True
                                self.log_test("Flows DELETE", True, f"Deleted flow {flow_id}")
                            else:
                                self.log_test("Flows DELETE", False, f"HTTP {response.status_code}")
                        except Exception as e:
                            self.log_test("Flows DELETE", False, str(e))
                else:
                    self.log_test("Flows CREATE", False, "API returned success=false")
            else:
                self.log_test("Flows CREATE", False, f"HTTP {response.status_code}")
        except Exception as e:
            self.log_test("Flows CREATE", False, str(e))

        return results

    def test_export_endpoints(self) -> Dict[str, Any]:
        """Test export endpoints"""
        results = {"fleet_csv": False, "fleet_json": False, "driver_csv": False}
        today = datetime.now().strftime('%Y-%m-%d')
        
        # Test fleet stats export CSV
        try:
            params = {'from_date': today, 'to_date': today, 'format': 'csv'}
            response = self.session.get(f"{self.api_url}/export/fleet-stats", params=params)
            if response.status_code == 200 and 'text/csv' in response.headers.get('content-type', ''):
                results["fleet_csv"] = True
                self.log_test("Export Fleet CSV", True, f"Size: {len(response.content)} bytes")
            else:
                self.log_test("Export Fleet CSV", False, f"HTTP {response.status_code}")
        except Exception as e:
            self.log_test("Export Fleet CSV", False, str(e))

        # Test fleet stats export JSON
        try:
            params = {'from_date': today, 'to_date': today, 'format': 'json'}
            response = self.session.get(f"{self.api_url}/export/fleet-stats", params=params)
            if response.status_code == 200 and 'application/json' in response.headers.get('content-type', ''):
                results["fleet_json"] = True
                self.log_test("Export Fleet JSON", True, f"Size: {len(response.content)} bytes")
            else:
                self.log_test("Export Fleet JSON", False, f"HTTP {response.status_code}")
        except Exception as e:
            self.log_test("Export Fleet JSON", False, str(e))

        # Test driver report export CSV
        try:
            week_ago = (datetime.now() - timedelta(days=7)).strftime('%Y-%m-%d')
            params = {'from_date': week_ago, 'to_date': today, 'format': 'csv'}
            response = self.session.get(f"{self.api_url}/export/driver-report", params=params)
            if response.status_code == 200 and 'text/csv' in response.headers.get('content-type', ''):
                results["driver_csv"] = True
                self.log_test("Export Driver CSV", True, f"Size: {len(response.content)} bytes")
            else:
                self.log_test("Export Driver CSV", False, f"HTTP {response.status_code}")
        except Exception as e:
            self.log_test("Export Driver CSV", False, str(e))

        return results

    def run_all_tests(self) -> Dict[str, Any]:
        """Run all backend API tests"""
        print("🚀 Starting Navixy Dashboard Backend API Tests")
        print(f"🔗 Testing API at: {self.api_url}")
        print("=" * 60)

        # Test results storage
        test_results = {
            "api_root": False,
            "trackers": {},
            "employees": {},
            "fleet_stats": {},
            "fleet_efficiency": {},
            "driver_report": {},
            "flows": {},
            "exports": {}
        }

        # Run tests
        test_results["api_root"] = self.test_api_root()
        test_results["trackers"] = self.test_trackers_endpoint()
        test_results["employees"] = self.test_employees_endpoint()
        test_results["fleet_stats"] = self.test_fleet_stats_endpoint()
        test_results["fleet_efficiency"] = self.test_fleet_efficiency_endpoint()
        test_results["driver_report"] = self.test_driver_report_endpoint()
        test_results["flows"] = self.test_flows_endpoints()
        test_results["exports"] = self.test_export_endpoints()

        # Print summary
        print("\n" + "=" * 60)
        print(f"📊 Test Summary: {self.tests_passed}/{self.tests_run} tests passed")
        
        if self.failed_tests:
            print("\n❌ Failed Tests:")
            for failed in self.failed_tests:
                print(f"  • {failed['test']}: {failed['error']}")
        
        success_rate = (self.tests_passed / self.tests_run * 100) if self.tests_run > 0 else 0
        print(f"✨ Success Rate: {success_rate:.1f}%")
        
        return {
            "success_rate": success_rate,
            "tests_passed": self.tests_passed,
            "tests_total": self.tests_run,
            "failed_tests": self.failed_tests,
            "test_results": test_results
        }

def main():
    """Main test execution"""
    tester = NavixyAPITester()
    results = tester.run_all_tests()
    
    # Return appropriate exit code
    return 0 if results["success_rate"] >= 80 else 1

if __name__ == "__main__":
    sys.exit(main())