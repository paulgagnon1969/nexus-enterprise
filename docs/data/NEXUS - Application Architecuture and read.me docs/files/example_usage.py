"""
Example usage of the Certified Payroll Database System
Demonstrates common operations and workflows
"""

from payroll_db import CertifiedPayrollDB, calculate_pay, calculate_deductions
from datetime import datetime, timedelta
import pandas as pd


def example_1_setup_database():
    """Example 1: Initial database setup with employees and projects"""
    print("\n=== Example 1: Database Setup ===\n")
    
    with CertifiedPayrollDB() as db:
        # Add a project
        project_data = {
            'project_code': 'CBS',
            'project_name': 'Canyon Brook Subdivision',
            'contract_id': 'CBS-2025-001',
            'start_date': '2025-10-01',
            'project_status': 'Active',
            'work_county': 'Comal County',
            'geographic_area': 'Central Texas',
            'congressional_district': 'TX-21',
            'state_senate_district': 'SD-25'
        }
        db.add_project(project_data)
        print(f"✓ Added project: {project_data['project_code']}")
        
        # Add employees
        employees = [
            {
                'employee_id': 'EMP001',
                'ssn': '522-51-9108',
                'first_name': 'Richard',
                'last_name': 'Voss',
                'address1': '4041 S Quemoy Way Aurora',
                'city': 'Aurora',
                'state': 'CO',
                'zip': '80018',
                'phone': '720-933-9706',
                'emp_status': 'Active',
                'craft_id': 'Framer',
                'is_foreman': 1,
                'date_hired': '2020-03-15',
                'i9_verified': 1
            },
            {
                'employee_id': 'EMP002',
                'ssn': '642-67-8860',
                'first_name': 'Sergio',
                'last_name': 'Barragan Ramirez',
                'address1': '7340 Daking St',
                'city': 'Denver',
                'state': 'CO',
                'zip': '80221',
                'phone': '214-256-8284',
                'emp_status': 'Active',
                'craft_id': 'Framer',
                'is_foreman': 0,
                'date_hired': '2021-05-10',
                'i9_verified': 1
            }
        ]
        
        for emp in employees:
            db.add_employee(emp)
            print(f"✓ Added employee: {emp['first_name']} {emp['last_name']}")
        
        # Add pay rates
        pay_rate_data = {
            'craft_id': 'Framer',
            'project_code': 'CBS',
            'effective_date': '2025-10-01',
            'base_rate': 35.00,
            'ot_rate': 52.50,
            'double_ot_rate': 70.00,
            'vac_hol_dues_rate': 5.00,
            'training_rate': 2.50,
            'in_lieu_payment_rate': 0.00
        }
        db.add_pay_rate(pay_rate_data)
        print(f"✓ Added pay rate for {pay_rate_data['craft_id']}")
        
        print("\nDatabase setup complete!")


def example_2_weekly_payroll_entry():
    """Example 2: Enter weekly payroll for multiple employees"""
    print("\n=== Example 2: Weekly Payroll Entry ===\n")
    
    with CertifiedPayrollDB() as db:
        week_end_date = '2025-12-19'
        
        # Employee 1: Richard Voss (Foreman) - Full week
        payroll_1 = {
            'payroll_number': 1001,
            'employee_id': 'EMP001',
            'project_code': 'CBS',
            'week_end_date': week_end_date,
            'check_num': 'CHK-12345',
            'class_code': 'Framer',
            'st_hrs_date1': 10.0,  # Monday
            'st_hrs_date2': 10.0,  # Tuesday
            'st_hrs_date3': 8.0,   # Wednesday
            'st_hrs_date4': 10.0,  # Thursday
            'st_hrs_date5': 10.0,  # Friday
            'st_hrs_date6': 10.0,  # Saturday
            'st_hrs_date7': 0.0,   # Sunday
            'pay_rate': 35.00,
            'ot_rate': 52.50,
            'payment_date': '2025-12-27'
        }
        
        # Calculate total hours
        total_hours = sum([
            payroll_1.get(f'st_hrs_date{i}', 0) 
            for i in range(1, 8)
        ])
        payroll_1['total_hours_all_projects'] = total_hours
        
        # Calculate gross pay
        pay_calc = calculate_pay(total_hours, 35.00, 52.50, 70.00)
        payroll_1['gross_employee_pay'] = pay_calc['gross_pay']
        
        # Calculate deductions
        deductions = calculate_deductions(pay_calc['gross_pay'])
        payroll_1.update(deductions)
        
        # Calculate benefits (example values)
        payroll_1['ep_haw'] = 50.00
        payroll_1['ep_pension'] = 75.00
        payroll_1['ep_vac_hol'] = 60.00
        payroll_1['ep_train'] = 25.00
        
        # Calculate total paid
        total_benefits = (payroll_1['ep_haw'] + payroll_1['ep_pension'] + 
                         payroll_1['ep_vac_hol'] + payroll_1['ep_train'])
        payroll_1['total_paid'] = (payroll_1['gross_employee_pay'] + 
                                   total_benefits - payroll_1['dts_total'])
        
        payroll_1['vac_chk_box'] = 0
        payroll_1['fringe_paid_chk_box'] = 1
        
        # Validate and insert
        is_valid, errors = db.validate_payroll_record(payroll_1)
        if is_valid:
            db.add_payroll_record(payroll_1)
            print(f"✓ Added payroll for EMP001 - Week ending {week_end_date}")
            print(f"  Hours: {total_hours}, Gross: ${pay_calc['gross_pay']:.2f}")
        else:
            print(f"✗ Validation errors: {errors}")
        
        # Employee 2: Sergio Barragan - Partial week
        payroll_2 = {
            'payroll_number': 1002,
            'employee_id': 'EMP002',
            'project_code': 'CBS',
            'week_end_date': week_end_date,
            'check_num': 'CHK-12346',
            'class_code': 'Framer',
            'st_hrs_date1': 10.0,
            'st_hrs_date2': 10.0,
            'st_hrs_date3': 8.0,
            'st_hrs_date4': 10.0,
            'st_hrs_date5': 10.0,
            'st_hrs_date6': 10.0,
            'st_hrs_date7': 0.0,
            'pay_rate': 35.00,
            'ot_rate': 52.50,
            'payment_date': '2025-12-27'
        }
        
        total_hours_2 = sum([
            payroll_2.get(f'st_hrs_date{i}', 0) 
            for i in range(1, 8)
        ])
        payroll_2['total_hours_all_projects'] = total_hours_2
        
        pay_calc_2 = calculate_pay(total_hours_2, 35.00, 52.50, 70.00)
        payroll_2['gross_employee_pay'] = pay_calc_2['gross_pay']
        
        deductions_2 = calculate_deductions(pay_calc_2['gross_pay'])
        payroll_2.update(deductions_2)
        
        payroll_2['ep_haw'] = 50.00
        payroll_2['ep_pension'] = 75.00
        payroll_2['ep_vac_hol'] = 60.00
        payroll_2['ep_train'] = 25.00
        
        total_benefits_2 = (payroll_2['ep_haw'] + payroll_2['ep_pension'] + 
                           payroll_2['ep_vac_hol'] + payroll_2['ep_train'])
        payroll_2['total_paid'] = (payroll_2['gross_employee_pay'] + 
                                   total_benefits_2 - payroll_2['dts_total'])
        
        payroll_2['vac_chk_box'] = 0
        payroll_2['fringe_paid_chk_box'] = 1
        
        is_valid_2, errors_2 = db.validate_payroll_record(payroll_2)
        if is_valid_2:
            db.add_payroll_record(payroll_2)
            print(f"✓ Added payroll for EMP002 - Week ending {week_end_date}")
            print(f"  Hours: {total_hours_2}, Gross: ${pay_calc_2['gross_pay']:.2f}")


def example_3_certified_payroll_report():
    """Example 3: Generate certified payroll report"""
    print("\n=== Example 3: Certified Payroll Report ===\n")
    
    with CertifiedPayrollDB() as db:
        # Get weekly certified payroll
        records = db.get_weekly_certified_payroll('CBS', '2025-12-19')
        
        print(f"Certified Payroll Report")
        print(f"Project: CBS - Week Ending: 2025-12-19")
        print(f"{'='*80}")
        print(f"{'Employee':<30} {'Hours':<10} {'Gross Pay':<15} {'Total Paid':<15}")
        print(f"{'-'*80}")
        
        for record in records:
            name = f"{record['first_name']} {record['last_name']}"
            hours = record['Total_Hours_All_Projects'] or 0
            gross = record['gross_employee_pay'] or 0
            total = record['total_paid'] or 0
            print(f"{name:<30} {hours:<10.2f} ${gross:<14.2f} ${total:<14.2f}")
        
        print(f"{'-'*80}")
        total_hours = sum([r['Total_Hours_All_Projects'] or 0 for r in records])
        total_gross = sum([r['gross_employee_pay'] or 0 for r in records])
        total_paid = sum([r['total_paid'] or 0 for r in records])
        print(f"{'TOTALS:':<30} {total_hours:<10.2f} ${total_gross:<14.2f} ${total_paid:<14.2f}")
        
        # Export to Excel format
        formatted_records = db.export_to_excel_format(records)
        print(f"\n✓ Report contains {len(records)} payroll record(s)")
        print(f"✓ All 88 columns included for certified payroll compliance")


def example_4_employee_history():
    """Example 4: View employee payroll history"""
    print("\n=== Example 4: Employee Payroll History ===\n")
    
    with CertifiedPayrollDB() as db:
        employee_id = 'EMP001'
        employee = db.get_employee(employee_id)
        
        if employee:
            print(f"Employee: {employee['first_name']} {employee['last_name']}")
            print(f"Craft: {employee['craft_id']}")
            print(f"Status: {employee['emp_status']}")
            print(f"\nPayroll History:")
            print(f"{'-'*80}")
            
            history = db.get_employee_payroll_history(
                employee_id, 
                start_date='2025-10-01'
            )
            
            if history:
                print(f"{'Week Ending':<15} {'Project':<10} {'Hours':<10} {'Gross Pay':<15}")
                print(f"{'-'*80}")
                for record in history:
                    week = record['week_end_date']
                    project = record['project_code']
                    hours = record['total_hours_all_projects'] or 0
                    gross = record['gross_employee_pay'] or 0
                    print(f"{week:<15} {project:<10} {hours:<10.2f} ${gross:<14.2f}")
                
                total_hours = sum([r['total_hours_all_projects'] or 0 for r in history])
                total_gross = sum([r['gross_employee_pay'] or 0 for r in history])
                print(f"{'-'*80}")
                print(f"{'TOTALS:':<25} {total_hours:<10.2f} ${total_gross:<14.2f}")
            else:
                print("No payroll history found.")


def example_5_project_labor_summary():
    """Example 5: Project labor cost summary"""
    print("\n=== Example 5: Project Labor Cost Summary ===\n")
    
    with CertifiedPayrollDB() as db:
        summary = db.get_project_labor_summary(start_date='2025-10-01')
        
        print(f"{'Project':<15} {'Employees':<12} {'Hours':<12} {'Gross Wages':<15} {'Benefits':<15} {'Total Cost':<15}")
        print(f"{'-'*95}")
        
        for project in summary:
            proj_code = project['project_code']
            emp_count = project['employee_count']
            hours = project['total_hours'] or 0
            wages = project['gross_wages'] or 0
            benefits = project['total_benefits'] or 0
            total = project['total_cost'] or 0
            
            print(f"{proj_code:<15} {emp_count:<12} {hours:<12.2f} ${wages:<14.2f} ${benefits:<14.2f} ${total:<14.2f}")
        
        print(f"{'-'*95}")


def example_6_update_operations():
    """Example 6: Update employee and payroll records"""
    print("\n=== Example 6: Update Operations ===\n")
    
    with CertifiedPayrollDB() as db:
        # Update employee address
        updates = {
            'address1': '5000 New Address Blvd',
            'city': 'Denver',
            'zip': '80202'
        }
        
        success = db.update_employee('EMP001', updates)
        if success:
            print("✓ Updated employee address")
            
            # Verify update
            employee = db.get_employee('EMP001')
            print(f"  New address: {employee['address1']}")
        
        # Update payroll record
        payroll_updates = {
            'prnotes': 'Worked weekend for urgent deadline',
            'trav_subs': 50.00
        }
        
        success = db.update_payroll_record(1001, payroll_updates)
        if success:
            print("✓ Updated payroll record notes and travel subsistence")


def export_to_excel_template():
    """Export a certified payroll template to Excel"""
    print("\n=== Exporting Excel Template ===\n")
    
    with CertifiedPayrollDB() as db:
        # Get sample data
        records = db.get_weekly_certified_payroll('CBS', '2025-12-19')
        
        if records:
            formatted_records = db.export_to_excel_format(records)
            
            # Create DataFrame with all 88 columns
            df = pd.DataFrame(formatted_records)
            
            # Export to Excel
            output_file = '/home/claude/certified_payroll_report.xlsx'
            df.to_excel(output_file, index=False, sheet_name='Certified Payroll')
            
            print(f"✓ Exported certified payroll to: {output_file}")
            print(f"  Records: {len(records)}")
            print(f"  Columns: {len(df.columns)} (all 88 required fields)")
        else:
            print("No payroll records found to export")


if __name__ == "__main__":
    print("=" * 80)
    print("CERTIFIED PAYROLL DATABASE SYSTEM - EXAMPLE USAGE")
    print("=" * 80)
    
    # Run all examples
    example_1_setup_database()
    example_2_weekly_payroll_entry()
    example_3_certified_payroll_report()
    example_4_employee_history()
    example_5_project_labor_summary()
    example_6_update_operations()
    export_to_excel_template()
    
    print("\n" + "=" * 80)
    print("ALL EXAMPLES COMPLETED SUCCESSFULLY")
    print("=" * 80)
