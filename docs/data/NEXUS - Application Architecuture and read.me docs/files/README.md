# Certified Payroll Database Management System
## Time Accounting and Asset Use

A comprehensive database system for managing certified payroll reporting with all 88 required fields for Davis-Bacon compliance.

---

## 📦 Package Contents

### Core Documentation
- **`certified_payroll_db_design.md`** - Complete database schema design with 88-column specification
- **`README.md`** - This file

### Python Modules
- **`payroll_db.py`** - Main database management module with SQLite implementation
- **`example_usage.py`** - Comprehensive examples demonstrating all features
- **`excel_template_generator.py`** - Excel template creation and export utilities

### Excel Templates
- **`certified_payroll_template.xlsx`** - Blank template with all 88 columns and formatting
- **`certified_payroll_populated.xlsx`** - Sample populated template with demo data
- **`certified_payroll_report.xlsx`** - Generated report example

### Database
- **`certified_payroll.db`** - SQLite database with sample data (created on first run)

---

## 🚀 Quick Start

### Installation

```bash
# Install required dependencies
pip install pandas openpyxl

# Or use the provided examples
python3 example_usage.py
```

### Basic Usage

```python
from payroll_db import CertifiedPayrollDB

# Initialize database
with CertifiedPayrollDB() as db:
    # Add an employee
    employee = {
        'employee_id': 'EMP001',
        'ssn': '123-45-6789',
        'first_name': 'John',
        'last_name': 'Doe',
        'craft_id': 'Framer',
        'emp_status': 'Active'
    }
    db.add_employee(employee)
    
    # Add a payroll record
    payroll = {
        'payroll_number': 1,
        'employee_id': 'EMP001',
        'project_code': 'CBS',
        'week_end_date': '2025-12-19',
        'st_hrs_date1': 8.0,
        'st_hrs_date2': 8.0,
        # ... additional hours and pay data
    }
    db.add_payroll_record(payroll)
    
    # Generate certified payroll report
    records = db.get_weekly_certified_payroll('CBS', '2025-12-19')
```

---

## 📊 The 88 Columns

### Column Categories

#### 1. Identification (9 columns)
- payroll_number
- project_code
- contract_id
- work_order
- week_end_date
- check_num
- ssn
- employee_ID
- class_code

#### 2. Pay & Wages (4 columns)
- gross_employee_pay
- all_projects
- wages_paid_in_lieu_of_fringes
- total_paid

#### 3. Daily Hours (8 columns)
- st_hrs_date1 through st_hrs_date7
- Total_Hours_All_Projects

#### 4. Employee Benefits (8 columns)
- ep_haw, ep_pension, ep_vac_hol, ep_train, ep_all_other
- emp_ep_haw, emp_ep_pension, emp_ep_other

#### 5. Deductions (9 columns)
- dts_fed_tax, dts_fica, dts_medicare, dts_state_tax
- dts_sdi, dts_dues, dts_savings, dts_other, dts_total

#### 6. Voluntary Contributions (4 columns)
- vol_cont_pension, vol_emp_pay_med
- vol_cont_pension_rate, vol_cont_medical_rate

#### 7. Rates (6 columns)
- pay_rate, OT_rate, 2OT_rate
- vac_hol_dues_rate, training_rate, in_lieu_payment_rate

#### 8. Employee Information (11 columns)
- first_name, last_name, address1, address2
- city, state, ZIP, phone
- gender, ethnicity, Email

#### 9. Job Classification (5 columns)
- apprentice_id, craft_id, emp_status
- vac_chk_box, fringe_paid_chk_box

#### 10. Compliance (4 columns)
- date_hired, I9Verified
- IsForeman, num_exempt

#### 11. Location (5 columns)
- work_county, Geographic_Ward, Geographic_Area
- Congressional_District, State_Senate_District

#### 12. Demographics (2 columns)
- IsDisadvantaged, VeteranStatus

#### 13. Transportation (5 columns)
- DriversLicense, DriversLicenseState, Owner_Operator
- trav_subs, OtherDeductionNotes

#### 14. Other (8 columns)
- prnotes, Payment_date
- OD_Category, OD_Type, OD_Amount
- FringesProvidedByEmployer, LocalUnionNumber
- YTD_SickPayTime

**Total: 88 columns** as required for certified payroll compliance

---

## 🗄️ Database Architecture

### Tables

1. **EMPLOYEES** - Master employee data (biographical, employment info)
2. **PROJECTS** - Project/contract information
3. **PAY_RATES** - Wage rate schedules by craft and project
4. **BENEFIT_RATES** - Employer benefit contribution rates
5. **PAYROLL_RECORDS** - Weekly transactional payroll data (88 fields)

### Key Design Decisions

**Normalization Benefits:**
- Employee data stored once, referenced by payroll records
- Pay rates centralized for consistency
- Easy updates to addresses, rates without touching payroll history
- Reduced data redundancy

**Why Not Fully Normalize All 88 Columns?**
- Certified payroll requires point-in-time snapshots
- Rates and benefits must reflect what was actually paid that week
- Audit trail requirements demand historical accuracy
- Reporting needs all 88 columns in flat format

**Best of Both Worlds:**
- Master data in normalized tables (employees, projects, rates)
- Transaction data in denormalized payroll_records table
- Join tables for reporting to get all 88 columns

---

## 📖 Common Operations

### 1. Weekly Payroll Entry Workflow

```python
with CertifiedPayrollDB() as db:
    # Step 1: Look up current pay rate
    pay_rate = db.get_current_pay_rate('Framer', 'CBS', '2025-12-19')
    
    # Step 2: Create payroll record
    payroll = {
        'payroll_number': 1001,
        'employee_id': 'EMP001',
        'project_code': 'CBS',
        'week_end_date': '2025-12-19',
        'st_hrs_date1': 10.0,
        'st_hrs_date2': 10.0,
        # ... more hours ...
        'pay_rate': pay_rate['base_rate'],
        'ot_rate': pay_rate['ot_rate']
    }
    
    # Step 3: Validate data
    is_valid, errors = db.validate_payroll_record(payroll)
    
    # Step 4: Insert if valid
    if is_valid:
        db.add_payroll_record(payroll)
```

### 2. Generate Weekly Certified Payroll

```python
with CertifiedPayrollDB() as db:
    records = db.get_weekly_certified_payroll('CBS', '2025-12-19')
    
    # Export to Excel
    formatted_records = db.export_to_excel_format(records)
    
    import pandas as pd
    df = pd.DataFrame(formatted_records)
    df.to_excel('certified_payroll_CBS_20251219.xlsx', index=False)
```

### 3. Employee Payroll History

```python
with CertifiedPayrollDB() as db:
    history = db.get_employee_payroll_history(
        'EMP001', 
        start_date='2025-10-01',
        end_date='2025-12-31'
    )
    
    for record in history:
        print(f"{record['week_end_date']}: {record['total_hours_all_projects']} hrs")
```

### 4. Project Labor Cost Analysis

```python
with CertifiedPayrollDB() as db:
    summary = db.get_project_labor_summary(
        project_code='CBS',
        start_date='2025-10-01',
        end_date='2025-12-31'
    )
    
    for project in summary:
        print(f"Project: {project['project_code']}")
        print(f"  Employees: {project['employee_count']}")
        print(f"  Total Hours: {project['total_hours']:.2f}")
        print(f"  Total Cost: ${project['total_cost']:.2f}")
```

---

## 🔧 Utility Functions

### Calculate Pay with Overtime

```python
from payroll_db import calculate_pay

result = calculate_pay(
    hours=58.0,
    base_rate=35.00,
    ot_rate=52.50,
    double_ot_rate=70.00
)

print(f"Regular Pay: ${result['regular_pay']:.2f}")
print(f"OT Pay: ${result['ot_pay']:.2f}")
print(f"Double OT Pay: ${result['double_ot_pay']:.2f}")
print(f"Gross Pay: ${result['gross_pay']:.2f}")
```

### Calculate Standard Deductions

```python
from payroll_db import calculate_deductions

deductions = calculate_deductions(
    gross_pay=2450.00,
    marital_status='single',
    exemptions=0
)

print(f"Federal Tax: ${deductions['dts_fed_tax']:.2f}")
print(f"FICA: ${deductions['dts_fica']:.2f}")
print(f"Medicare: ${deductions['dts_medicare']:.2f}")
print(f"Total Deductions: ${deductions['dts_total']:.2f}")
```

---

## 📑 Excel Template Usage

### Blank Template

Use `certified_payroll_template.xlsx` as a starting point:
- All 88 columns pre-configured
- Professional formatting
- Frozen header row
- Appropriate column widths
- Instructions included

### Populate from Database

```python
from excel_template_generator import create_populated_certified_payroll

create_populated_certified_payroll(
    db_path='certified_payroll.db',
    project_code='CBS',
    week_end_date='2025-12-19',
    output_path='payroll_CBS_20251219.xlsx'
)
```

---

## ✅ Data Validation Rules

The system enforces these validation rules:

### Hours
- Each daily hour value: 0 to 24
- Total weekly hours: 0 to 168 (7 days × 24 hours)

### Monetary Values
- All amounts must be ≥ 0
- Pay rates must be positive

### Dates
- week_end_date typically should be a Friday
- payment_date must be ≥ week_end_date

### Required Fields
- employee_id (must exist in EMPLOYEES table)
- project_code (must exist in PROJECTS table)
- week_end_date

### Calculations
- total_hours = sum of st_hrs_date1 through st_hrs_date7
- dts_total = sum of all individual deductions
- total_paid = gross_pay + benefits - deductions

---

## 🔐 Security & Compliance

### Data Protection
- SSN should be encrypted in production environments
- Role-based access control recommended
- Audit logging of all modifications
- Regular backups (daily recommended)

### Compliance Requirements
- Davis-Bacon Act certified payroll standards
- State prevailing wage requirements
- 7-year record retention minimum
- GDPR/CCPA considerations for employee data

---

## 🎯 Best Practices

### Database Management
1. **Regular Backups**: Daily incremental, weekly full
2. **Archive Old Records**: Move records >2 years to archive database
3. **Index Maintenance**: Ensure indexes on frequently queried fields
4. **Validation**: Always validate data before insertion

### Payroll Processing
1. **Week-End Consistency**: Use Fridays for week_end_date
2. **Rate Accuracy**: Verify pay rates before processing
3. **Double-Check Totals**: Validate calculations match manual checks
4. **Document Changes**: Note any adjustments in prnotes field

### Reporting
1. **Generate Weekly**: Create certified payroll reports every week
2. **Archive PDFs**: Save PDF copies for compliance
3. **Verify Completeness**: Ensure all 88 columns populated
4. **Cross-Reference**: Match against accounting system

---

## 📊 Example Reports

### Weekly Certified Payroll
- All employees for a project and week
- All 88 columns in required format
- Suitable for submission to awarding agencies

### Employee Earnings Statement
- Individual employee payroll history
- Totals by project and time period
- Year-to-date summaries

### Project Cost Analysis
- Labor costs by project
- Employee count and hour totals
- Benefit and deduction summaries

### Compliance Report
- Prevailing wage verification
- Fringe benefit confirmation
- Required demographic reporting

---

## 🛠️ Extending the System

### Adding New Columns
If you need additional tracking:

```python
# Add column to payroll_records table
db.cursor.execute("""
ALTER TABLE payroll_records 
ADD COLUMN new_field_name REAL
""")
db.conn.commit()
```

### Custom Reports
Create custom queries:

```python
def custom_report(db, parameters):
    query = """
    SELECT 
        custom_fields
    FROM payroll_records
    WHERE custom_conditions
    """
    db.cursor.execute(query, parameters)
    return [dict(row) for row in db.cursor.fetchall()]
```

### API Integration
The database module can be wrapped in a REST API:

```python
from flask import Flask, jsonify
from payroll_db import CertifiedPayrollDB

app = Flask(__name__)

@app.route('/api/payroll/weekly/<project>/<date>')
def get_weekly_payroll(project, date):
    with CertifiedPayrollDB() as db:
        records = db.get_weekly_certified_payroll(project, date)
        return jsonify(records)
```

---

## 🐛 Troubleshooting

### Common Issues

**Issue**: "Unable to connect to database"
- **Solution**: Ensure write permissions in database directory

**Issue**: "Validation errors on payroll record"
- **Solution**: Check required fields and data ranges with `validate_payroll_record()`

**Issue**: "Excel export missing columns"
- **Solution**: Use `export_to_excel_format()` to ensure all 88 columns included

**Issue**: "Calculation mismatches"
- **Solution**: Verify pay rates and benefit rates are current and accurate

---

## 📞 Support

### Getting Help
- Review `certified_payroll_db_design.md` for detailed schema information
- Run `example_usage.py` to see working examples
- Check validation errors with `validate_payroll_record()`

### Common Questions

**Q: Can I use MySQL or PostgreSQL instead of SQLite?**
A: Yes! The SQL schema in the design doc can be adapted for any SQL database. Update the connection string in `CertifiedPayrollDB.__init__()`.

**Q: How do I handle multiple projects per employee per week?**
A: Create separate payroll_records for each project/week combination. Sum hours across records for total weekly hours.

**Q: What about union-specific requirements?**
A: The system includes union fields (local_union_number, craft_id). Customize benefit_rates table for union-specific rates.

**Q: Can this integrate with QuickBooks/Sage/etc?**
A: Yes! Export functionality can be customized to match your accounting system's import format.

---

## 📝 License

This system is provided as-is for certified payroll management. Ensure compliance with all local, state, and federal wage and hour laws.

---

## 🔄 Version History

- **v1.0** (2025-12-30) - Initial release
  - Complete 88-column certified payroll system
  - SQLite database implementation
  - Excel template generation
  - Comprehensive examples and documentation

---

## 🎓 Additional Resources

### Certified Payroll References
- U.S. Department of Labor - Wage and Hour Division
- Davis-Bacon Act requirements
- State prevailing wage determinations
- Federal contract compliance guidelines

### Technical Documentation
- `certified_payroll_db_design.md` - Complete schema documentation
- `payroll_db.py` - Inline code documentation
- `example_usage.py` - Working code examples

---

**Last Updated**: December 30, 2025  
**System Version**: 1.0  
**Database Schema Version**: 1.0
