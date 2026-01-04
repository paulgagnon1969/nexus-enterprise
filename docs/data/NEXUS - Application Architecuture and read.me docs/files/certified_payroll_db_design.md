# Certified Payroll Database Design
## Time Accounting and Asset Use Management System

---

## Executive Summary

This database manages certified payroll reporting for construction projects with comprehensive time tracking, wage calculations, benefits administration, and compliance reporting. The system tracks 88 data points per payroll record while maintaining data integrity through normalization.

---

## Database Schema Overview

### Core Design Principles
1. **Normalization**: Separate employee master data from transactional payroll records
2. **Efficiency**: Store repetitive data once (employees, projects, rates)
3. **Compliance**: Maintain audit trail for certified payroll requirements
4. **Flexibility**: Support multiple pay rates, benefits, and deduction types

---

## Table Structures

### 1. EMPLOYEES (Master Data)
**Purpose**: Store employee biographical and employment information

```sql
CREATE TABLE employees (
    employee_id VARCHAR(50) PRIMARY KEY,
    ssn VARCHAR(11) UNIQUE NOT NULL,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    address1 VARCHAR(200),
    address2 VARCHAR(200),
    city VARCHAR(100),
    state VARCHAR(2),
    zip VARCHAR(10),
    phone VARCHAR(20),
    email VARCHAR(100),
    gender VARCHAR(20),
    ethnicity VARCHAR(50),
    date_hired DATE,
    emp_status VARCHAR(20),
    craft_id VARCHAR(50),
    apprentice_id VARCHAR(50),
    is_foreman BOOLEAN DEFAULT FALSE,
    is_disadvantaged BOOLEAN DEFAULT FALSE,
    veteran_status VARCHAR(50),
    drivers_license VARCHAR(50),
    drivers_license_state VARCHAR(2),
    owner_operator BOOLEAN DEFAULT FALSE,
    i9_verified BOOLEAN DEFAULT FALSE,
    num_exempt INTEGER DEFAULT 0,
    local_union_number VARCHAR(50),
    created_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    modified_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

**Key Fields**:
- `employee_id`: Internal unique identifier
- `ssn`: Social Security Number (encrypted in production)
- `emp_status`: Active, Terminated, On Leave, etc.
- `craft_id`: Trade classification (Framer, Electrician, Plumber, etc.)

---

### 2. PROJECTS (Master Data)
**Purpose**: Track construction projects and contracts

```sql
CREATE TABLE projects (
    project_code VARCHAR(50) PRIMARY KEY,
    project_name VARCHAR(200) NOT NULL,
    contract_id VARCHAR(100),
    start_date DATE,
    end_date DATE,
    client_name VARCHAR(200),
    project_status VARCHAR(20),
    geographic_ward VARCHAR(50),
    geographic_area VARCHAR(100),
    congressional_district VARCHAR(50),
    state_senate_district VARCHAR(50),
    work_county VARCHAR(100),
    created_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    modified_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

---

### 3. PAY_RATES (Reference Data)
**Purpose**: Manage different pay rate schedules by craft and project

```sql
CREATE TABLE pay_rates (
    rate_id SERIAL PRIMARY KEY,
    craft_id VARCHAR(50) NOT NULL,
    project_code VARCHAR(50),
    effective_date DATE NOT NULL,
    base_rate DECIMAL(10,2) NOT NULL,
    ot_rate DECIMAL(10,2),
    double_ot_rate DECIMAL(10,2),
    vac_hol_dues_rate DECIMAL(10,2),
    training_rate DECIMAL(10,2),
    in_lieu_payment_rate DECIMAL(10,2),
    is_active BOOLEAN DEFAULT TRUE,
    FOREIGN KEY (project_code) REFERENCES projects(project_code)
);
```

---

### 4. BENEFIT_RATES (Reference Data)
**Purpose**: Track employer-provided benefit contribution rates

```sql
CREATE TABLE benefit_rates (
    benefit_rate_id SERIAL PRIMARY KEY,
    rate_type VARCHAR(50) NOT NULL,
    craft_id VARCHAR(50),
    project_code VARCHAR(50),
    effective_date DATE NOT NULL,
    emp_ep_haw DECIMAL(10,2),
    emp_ep_pension DECIMAL(10,2),
    emp_ep_other DECIMAL(10,2),
    vol_cont_pension_rate DECIMAL(10,2),
    vol_cont_medical_rate DECIMAL(10,2),
    is_active BOOLEAN DEFAULT TRUE,
    FOREIGN KEY (project_code) REFERENCES projects(project_code)
);
```

---

### 5. PAYROLL_RECORDS (Transactional Data)
**Purpose**: Store weekly certified payroll entries

```sql
CREATE TABLE payroll_records (
    payroll_number INTEGER PRIMARY KEY,
    employee_id VARCHAR(50) NOT NULL,
    project_code VARCHAR(50) NOT NULL,
    week_end_date DATE NOT NULL,
    payment_date DATE,
    check_num VARCHAR(50),
    work_order VARCHAR(100),
    class_code VARCHAR(50),
    
    -- Hours Worked (7 days)
    st_hrs_date1 DECIMAL(5,2),
    st_hrs_date2 DECIMAL(5,2),
    st_hrs_date3 DECIMAL(5,2),
    st_hrs_date4 DECIMAL(5,2),
    st_hrs_date5 DECIMAL(5,2),
    st_hrs_date6 DECIMAL(5,2),
    st_hrs_date7 DECIMAL(5,2),
    total_hours_all_projects DECIMAL(6,2),
    
    -- Wages
    gross_employee_pay DECIMAL(10,2),
    all_projects DECIMAL(10,2),
    wages_paid_in_lieu_of_fringes DECIMAL(10,2),
    total_paid DECIMAL(10,2),
    
    -- Rates Applied
    pay_rate DECIMAL(10,2),
    ot_rate DECIMAL(10,2),
    double_ot_rate DECIMAL(10,2),
    
    -- Benefits Paid
    ep_haw DECIMAL(10,2),
    ep_pension DECIMAL(10,2),
    ep_vac_hol DECIMAL(10,2),
    ep_train DECIMAL(10,2),
    ep_all_other DECIMAL(10,2),
    
    -- Voluntary Contributions
    vol_cont_pension DECIMAL(10,2),
    vol_emp_pay_med DECIMAL(10,2),
    
    -- Deductions
    dts_fed_tax DECIMAL(10,2),
    dts_fica DECIMAL(10,2),
    dts_medicare DECIMAL(10,2),
    dts_state_tax DECIMAL(10,2),
    dts_sdi DECIMAL(10,2),
    dts_dues DECIMAL(10,2),
    dts_savings DECIMAL(10,2),
    dts_other DECIMAL(10,2),
    dts_total DECIMAL(10,2),
    
    -- Other Deductions Detail
    od_category VARCHAR(100),
    od_type VARCHAR(100),
    od_amount DECIMAL(10,2),
    
    -- Travel and Subsistence
    trav_subs DECIMAL(10,2),
    
    -- Flags and Checkboxes
    vac_chk_box BOOLEAN,
    fringe_paid_chk_box BOOLEAN,
    fringes_provided_by_employer VARCHAR(200),
    
    -- Notes
    prnotes TEXT,
    other_deduction_notes TEXT,
    
    -- Audit Fields
    ytd_sick_pay_time DECIMAL(10,2),
    created_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    modified_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (employee_id) REFERENCES employees(employee_id),
    FOREIGN KEY (project_code) REFERENCES projects(project_code),
    INDEX idx_week_end (week_end_date),
    INDEX idx_employee (employee_id),
    INDEX idx_project (project_code)
);
```

---

## Key Relationships

```
EMPLOYEES (1) ----< (N) PAYROLL_RECORDS
PROJECTS (1) ----< (N) PAYROLL_RECORDS
PROJECTS (1) ----< (N) PAY_RATES
PROJECTS (1) ----< (N) BENEFIT_RATES
```

---

## Data Flow and Usage Patterns

### Weekly Payroll Entry Process
1. **Setup Phase** (Once per employee)
   - Create employee record in EMPLOYEES table
   - Assign craft_id and employment details
   
2. **Project Assignment**
   - Create project in PROJECTS table
   - Set up pay rates in PAY_RATES table
   - Configure benefit rates in BENEFIT_RATES table

3. **Weekly Time Entry**
   - Create payroll_record for employee/project/week
   - Enter daily hours (st_hrs_date1 through st_hrs_date7)
   - System calculates total_hours_all_projects
   
4. **Wage Calculation**
   - System looks up applicable pay_rate from PAY_RATES
   - Calculates gross_employee_pay based on hours and rates
   - Applies overtime calculations if applicable
   
5. **Benefits & Deductions**
   - System applies benefit rates from BENEFIT_RATES
   - Calculates standard deductions (Federal, FICA, Medicare, State)
   - Records voluntary contributions
   - Computes total_paid

6. **Certified Payroll Export**
   - Query joins PAYROLL_RECORDS + EMPLOYEES + PROJECTS
   - Generates report with all 88 required fields
   - Produces compliant certified payroll documents

---

## Column Usage Guide

### Always Used Columns (Core Data)
- employee_id, ssn, first_name, last_name
- project_code, week_end_date
- Daily hours (st_hrs_date1-7)
- gross_employee_pay, total_paid
- class_code, emp_status

### Frequently Used Columns
- Benefits: ep_haw, ep_pension, ep_vac_hol, ep_train
- Deductions: dts_fed_tax, dts_fica, dts_medicare, dts_state_tax
- Flags: vac_chk_box, fringe_paid_chk_box, is_foreman

### Occasionally Used Columns
- Address fields (when updated)
- Geographic data (project-specific)
- Special deductions (od_category, od_type, od_amount)
- Travel subsistence (trav_subs)

### Rarely Used Columns (But Required for Compliance)
- Drivers license information
- Owner_operator status
- Congressional/Senate district data
- YTD tracking fields

---

## Indexing Strategy

### Primary Indexes
- `employee_id` (EMPLOYEES primary key)
- `project_code` (PROJECTS primary key)
- `payroll_number` (PAYROLL_RECORDS primary key)

### Secondary Indexes
```sql
CREATE INDEX idx_payroll_employee ON payroll_records(employee_id);
CREATE INDEX idx_payroll_project ON payroll_records(project_code);
CREATE INDEX idx_payroll_week ON payroll_records(week_end_date);
CREATE INDEX idx_employee_ssn ON employees(ssn);
CREATE INDEX idx_employee_status ON employees(emp_status);
CREATE INDEX idx_project_status ON projects(project_status);
```

---

## Query Patterns

### 1. Weekly Certified Payroll Report
```sql
SELECT 
    pr.payroll_number,
    pr.project_code,
    p.contract_id,
    pr.week_end_date,
    pr.check_num,
    e.ssn,
    pr.employee_id,
    pr.class_code,
    e.first_name,
    e.last_name,
    e.address1,
    e.city,
    e.state,
    e.zip,
    pr.st_hrs_date1,
    pr.st_hrs_date2,
    pr.st_hrs_date3,
    pr.st_hrs_date4,
    pr.st_hrs_date5,
    pr.st_hrs_date6,
    pr.st_hrs_date7,
    pr.total_hours_all_projects,
    pr.gross_employee_pay,
    pr.total_paid,
    pr.pay_rate,
    e.is_foreman,
    e.emp_status
FROM payroll_records pr
JOIN employees e ON pr.employee_id = e.employee_id
JOIN projects p ON pr.project_code = p.project_code
WHERE pr.week_end_date = '2025-12-19'
AND pr.project_code = 'CBS'
ORDER BY e.last_name, e.first_name;
```

### 2. Employee Total Hours by Project
```sql
SELECT 
    e.employee_id,
    e.first_name,
    e.last_name,
    pr.project_code,
    SUM(pr.total_hours_all_projects) as total_hours,
    SUM(pr.gross_employee_pay) as total_earnings
FROM payroll_records pr
JOIN employees e ON pr.employee_id = e.employee_id
WHERE pr.week_end_date BETWEEN '2025-10-01' AND '2025-12-31'
GROUP BY e.employee_id, e.first_name, e.last_name, pr.project_code
ORDER BY e.last_name, pr.project_code;
```

### 3. Project Labor Cost Summary
```sql
SELECT 
    pr.project_code,
    p.project_name,
    COUNT(DISTINCT pr.employee_id) as employee_count,
    SUM(pr.total_hours_all_projects) as total_hours,
    SUM(pr.gross_employee_pay) as gross_wages,
    SUM(pr.ep_haw + pr.ep_pension + pr.ep_vac_hol + pr.ep_train) as total_benefits,
    SUM(pr.total_paid) as total_cost
FROM payroll_records pr
JOIN projects p ON pr.project_code = p.project_code
WHERE pr.week_end_date >= '2025-01-01'
GROUP BY pr.project_code, p.project_name
ORDER BY total_cost DESC;
```

---

## Data Validation Rules

### Employee Data
- SSN must be unique and properly formatted (XXX-XX-XXXX)
- Phone numbers validated for format
- Email addresses validated for format
- State codes must be valid 2-letter codes
- ZIP codes validated (5 or 9 digit format)

### Payroll Data
- Hours must be >= 0 and <= 24 per day
- Total weekly hours <= 168 (7 days × 24 hours)
- All monetary amounts >= 0
- week_end_date must be a Friday (certified payroll standard)
- payment_date must be >= week_end_date

### Calculation Validations
- `total_paid = gross_employee_pay + benefits - deductions`
- `dts_total = sum of all individual deductions`
- `total_hours_all_projects = sum(st_hrs_date1 through st_hrs_date7)`

---

## Security Considerations

### Sensitive Data Protection
1. **SSN Encryption**: Encrypt SSN field at rest and in transit
2. **Access Control**: Role-based access (Admin, Payroll, Read-only)
3. **Audit Logging**: Track all modifications to payroll records
4. **Data Retention**: Maintain certified payroll records for 7 years minimum

### Compliance Requirements
- Davis-Bacon Act compliance for federal projects
- State prevailing wage requirements
- Certified payroll reporting standards
- Employee privacy protections (GDPR, CCPA)

---

## Backup and Archive Strategy

### Regular Backups
- **Daily**: Incremental backups of all tables
- **Weekly**: Full database backup
- **Monthly**: Archive to long-term storage

### Archive Strategy
- Move records older than 2 years to archive database
- Maintain 7-year retention for compliance
- Compress archived data to save storage

---

## Performance Optimization

### Table Partitioning
Consider partitioning PAYROLL_RECORDS by year:
```sql
-- Partition by year for better query performance
CREATE TABLE payroll_records_2025 PARTITION OF payroll_records
FOR VALUES FROM ('2025-01-01') TO ('2026-01-01');
```

### Materialized Views
Create materialized views for common reports:
```sql
CREATE MATERIALIZED VIEW mv_weekly_payroll_summary AS
SELECT 
    week_end_date,
    project_code,
    COUNT(*) as employee_count,
    SUM(total_hours_all_projects) as total_hours,
    SUM(total_paid) as total_cost
FROM payroll_records
GROUP BY week_end_date, project_code;
```

---

## Integration Points

### External Systems
1. **Accounting System**: Export payroll totals for general ledger
2. **HR System**: Import employee master data
3. **Time Tracking**: Import daily hours from field systems
4. **Government Reporting**: Export certified payroll reports

### API Endpoints (if applicable)
- `POST /api/payroll/records` - Create payroll record
- `GET /api/payroll/weekly/{project}/{date}` - Get weekly payroll
- `GET /api/employees/{id}` - Get employee details
- `PUT /api/employees/{id}` - Update employee information

---

## Migration Strategy

### From Spreadsheet to Database
1. **Extract**: Export current Excel data to CSV
2. **Transform**: Clean and normalize data
   - Split into EMPLOYEES, PROJECTS, PAYROLL_RECORDS
   - Generate unique IDs
   - Validate data integrity
3. **Load**: Import to database tables
4. **Verify**: Run validation queries to ensure accuracy

---

## Reporting Capabilities

### Standard Reports
1. **Weekly Certified Payroll** - By project and week
2. **Employee Earnings Statement** - Individual pay stubs
3. **Project Cost Analysis** - Labor cost by project
4. **Compliance Report** - Prevailing wage verification
5. **Benefits Summary** - Employer contributions by type
6. **Deduction Summary** - Tax and other deductions

---

## Future Enhancements

### Potential Additions
1. **Time and Attendance Integration**: Real-time clock-in/out
2. **Mobile Entry**: Field employees enter hours via app
3. **Automated Calculations**: Real-time wage and benefit calculations
4. **Electronic Signatures**: Digital approval workflow
5. **Advanced Analytics**: Predictive labor cost modeling
6. **Multi-Currency Support**: International project capabilities

---

## Appendix: Column Reference

### Complete 88-Column List by Category

**Identification (7)**
1. payroll_number
2. project_code
3. contract_id
4. work_order
5. employee_ID
6. ssn
7. check_num

**Time Period (2)**
8. week_end_date
9. Payment_date

**Daily Hours (8)**
10-16. st_hrs_date1 through st_hrs_date7
17. Total_Hours_All_Projects

**Pay & Wages (7)**
18. gross_employee_pay
19. all_projects
20. wages_paid_in_lieu_of_fringes
21. total_paid
22. pay_rate
23. OT_rate
24. 2OT_rate

**Employee Benefits (8)**
25. ep_haw
26. ep_pension
27. ep_vac_hol
28. ep_train
29. ep_all_other
30. emp_ep_haw
31. emp_ep_pension
32. emp_ep_other

**Deductions (9)**
33. dts_fed_tax
34. dts_fica
35. dts_medicare
36. dts_state_tax
37. dts_sdi
38. dts_dues
39. dts_savings
40. dts_other
41. dts_total

**Voluntary Contributions (4)**
42. vol_cont_pension
43. vol_emp_pay_med
44. vol_cont_pension_rate
45. vol_cont_medical_rate

**Employee Info (11)**
46. first_name
47. last_name
48. address1
49. address2
50. city
51. state
52. ZIP
53. phone
54. gender
55. ethnicity
56. Email

**Job Classification (5)**
57. class_code
58. craft_id
59. apprentice_id
60. emp_status
61. IsForeman

**Rates & Fringes (3)**
62. vac_hol_dues_rate
63. training_rate
64. in_lieu_payment_rate

**Compliance Flags (4)**
65. vac_chk_box
66. fringe_paid_chk_box
67. date_hired
68. I9Verified

**Demographics (3)**
69. IsDisadvantaged
70. VeteranStatus
71. num_exempt

**Location (5)**
72. work_county
73. Geographic_Ward
74. Geographic_Area
75. Congressional_District
76. State_Senate_District

**Transportation (4)**
77. DriversLicense
78. DriversLicenseState
79. Owner_Operator
80. trav_subs

**Other (8)**
81. prnotes
82. OtherDeductionNotes
83. OD_Category
84. OD_Type
85. OD_Amount
86. FringesProvidedByEmployer
87. LocalUnionNumber
88. YTD_SickPayTime

---

**Document Version**: 1.0  
**Last Updated**: December 30, 2025  
**Author**: Certified Payroll Database Team
