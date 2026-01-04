"""
Certified Payroll Database Management System
Handles all database operations for time accounting and payroll management
"""

import sqlite3
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Tuple
import json


class CertifiedPayrollDB:
    """Main database management class for certified payroll system"""
    
    def __init__(self, db_path: str = "certified_payroll.db"):
        """Initialize database connection and create tables if needed"""
        self.db_path = db_path
        self.conn = sqlite3.connect(db_path)
        self.conn.row_factory = sqlite3.Row
        self.cursor = self.conn.cursor()
        self.create_tables()
    
    def create_tables(self):
        """Create all necessary database tables"""
        
        # EMPLOYEES table
        self.cursor.execute("""
        CREATE TABLE IF NOT EXISTS employees (
            employee_id TEXT PRIMARY KEY,
            ssn TEXT UNIQUE NOT NULL,
            first_name TEXT NOT NULL,
            last_name TEXT NOT NULL,
            address1 TEXT,
            address2 TEXT,
            city TEXT,
            state TEXT,
            zip TEXT,
            phone TEXT,
            email TEXT,
            gender TEXT,
            ethnicity TEXT,
            date_hired DATE,
            emp_status TEXT DEFAULT 'Active',
            craft_id TEXT,
            apprentice_id TEXT,
            is_foreman INTEGER DEFAULT 0,
            is_disadvantaged INTEGER DEFAULT 0,
            veteran_status TEXT,
            drivers_license TEXT,
            drivers_license_state TEXT,
            owner_operator INTEGER DEFAULT 0,
            i9_verified INTEGER DEFAULT 0,
            num_exempt INTEGER DEFAULT 0,
            local_union_number TEXT,
            created_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            modified_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
        """)
        
        # PROJECTS table
        self.cursor.execute("""
        CREATE TABLE IF NOT EXISTS projects (
            project_code TEXT PRIMARY KEY,
            project_name TEXT NOT NULL,
            contract_id TEXT,
            start_date DATE,
            end_date DATE,
            client_name TEXT,
            project_status TEXT DEFAULT 'Active',
            geographic_ward TEXT,
            geographic_area TEXT,
            congressional_district TEXT,
            state_senate_district TEXT,
            work_county TEXT,
            created_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            modified_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
        """)
        
        # PAY_RATES table
        self.cursor.execute("""
        CREATE TABLE IF NOT EXISTS pay_rates (
            rate_id INTEGER PRIMARY KEY AUTOINCREMENT,
            craft_id TEXT NOT NULL,
            project_code TEXT,
            effective_date DATE NOT NULL,
            base_rate REAL NOT NULL,
            ot_rate REAL,
            double_ot_rate REAL,
            vac_hol_dues_rate REAL,
            training_rate REAL,
            in_lieu_payment_rate REAL,
            is_active INTEGER DEFAULT 1,
            FOREIGN KEY (project_code) REFERENCES projects(project_code)
        )
        """)
        
        # BENEFIT_RATES table
        self.cursor.execute("""
        CREATE TABLE IF NOT EXISTS benefit_rates (
            benefit_rate_id INTEGER PRIMARY KEY AUTOINCREMENT,
            rate_type TEXT NOT NULL,
            craft_id TEXT,
            project_code TEXT,
            effective_date DATE NOT NULL,
            emp_ep_haw REAL,
            emp_ep_pension REAL,
            emp_ep_other REAL,
            vol_cont_pension_rate REAL,
            vol_cont_medical_rate REAL,
            is_active INTEGER DEFAULT 1,
            FOREIGN KEY (project_code) REFERENCES projects(project_code)
        )
        """)
        
        # PAYROLL_RECORDS table (main transactional table)
        self.cursor.execute("""
        CREATE TABLE IF NOT EXISTS payroll_records (
            payroll_number INTEGER PRIMARY KEY,
            employee_id TEXT NOT NULL,
            project_code TEXT NOT NULL,
            week_end_date DATE NOT NULL,
            payment_date DATE,
            check_num TEXT,
            work_order TEXT,
            class_code TEXT,
            
            -- Daily Hours
            st_hrs_date1 REAL,
            st_hrs_date2 REAL,
            st_hrs_date3 REAL,
            st_hrs_date4 REAL,
            st_hrs_date5 REAL,
            st_hrs_date6 REAL,
            st_hrs_date7 REAL,
            total_hours_all_projects REAL,
            
            -- Wages
            gross_employee_pay REAL,
            all_projects REAL,
            wages_paid_in_lieu_of_fringes REAL,
            total_paid REAL,
            
            -- Rates
            pay_rate REAL,
            ot_rate REAL,
            double_ot_rate REAL,
            
            -- Benefits
            ep_haw REAL,
            ep_pension REAL,
            ep_vac_hol REAL,
            ep_train REAL,
            ep_all_other REAL,
            
            -- Voluntary Contributions
            vol_cont_pension REAL,
            vol_emp_pay_med REAL,
            
            -- Deductions
            dts_fed_tax REAL,
            dts_fica REAL,
            dts_medicare REAL,
            dts_state_tax REAL,
            dts_sdi REAL,
            dts_dues REAL,
            dts_savings REAL,
            dts_other REAL,
            dts_total REAL,
            
            -- Other Deduction Details
            od_category TEXT,
            od_type TEXT,
            od_amount REAL,
            
            -- Travel
            trav_subs REAL,
            
            -- Flags
            vac_chk_box INTEGER,
            fringe_paid_chk_box INTEGER,
            fringes_provided_by_employer TEXT,
            
            -- Notes
            prnotes TEXT,
            other_deduction_notes TEXT,
            
            -- Audit
            ytd_sick_pay_time REAL,
            created_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            modified_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            
            FOREIGN KEY (employee_id) REFERENCES employees(employee_id),
            FOREIGN KEY (project_code) REFERENCES projects(project_code)
        )
        """)
        
        # Create indexes for performance
        self.cursor.execute("""
        CREATE INDEX IF NOT EXISTS idx_payroll_employee 
        ON payroll_records(employee_id)
        """)
        
        self.cursor.execute("""
        CREATE INDEX IF NOT EXISTS idx_payroll_project 
        ON payroll_records(project_code)
        """)
        
        self.cursor.execute("""
        CREATE INDEX IF NOT EXISTS idx_payroll_week 
        ON payroll_records(week_end_date)
        """)
        
        self.cursor.execute("""
        CREATE INDEX IF NOT EXISTS idx_employee_ssn 
        ON employees(ssn)
        """)
        
        self.conn.commit()
    
    # ========== EMPLOYEE OPERATIONS ==========
    
    def add_employee(self, employee_data: Dict) -> str:
        """Add a new employee to the database"""
        columns = ', '.join(employee_data.keys())
        placeholders = ', '.join(['?' for _ in employee_data])
        
        query = f"""
        INSERT INTO employees ({columns})
        VALUES ({placeholders})
        """
        
        self.cursor.execute(query, list(employee_data.values()))
        self.conn.commit()
        return employee_data.get('employee_id')
    
    def update_employee(self, employee_id: str, updates: Dict) -> bool:
        """Update employee information"""
        updates['modified_date'] = datetime.now().isoformat()
        set_clause = ', '.join([f"{k} = ?" for k in updates.keys()])
        
        query = f"""
        UPDATE employees 
        SET {set_clause}
        WHERE employee_id = ?
        """
        
        self.cursor.execute(query, list(updates.values()) + [employee_id])
        self.conn.commit()
        return self.cursor.rowcount > 0
    
    def get_employee(self, employee_id: str) -> Optional[Dict]:
        """Retrieve employee information"""
        self.cursor.execute("""
        SELECT * FROM employees WHERE employee_id = ?
        """, (employee_id,))
        
        row = self.cursor.fetchone()
        return dict(row) if row else None
    
    def get_all_employees(self, status: str = 'Active') -> List[Dict]:
        """Get all employees with optional status filter"""
        if status:
            self.cursor.execute("""
            SELECT * FROM employees WHERE emp_status = ?
            ORDER BY last_name, first_name
            """, (status,))
        else:
            self.cursor.execute("""
            SELECT * FROM employees 
            ORDER BY last_name, first_name
            """)
        
        return [dict(row) for row in self.cursor.fetchall()]
    
    # ========== PROJECT OPERATIONS ==========
    
    def add_project(self, project_data: Dict) -> str:
        """Add a new project"""
        columns = ', '.join(project_data.keys())
        placeholders = ', '.join(['?' for _ in project_data])
        
        query = f"""
        INSERT INTO projects ({columns})
        VALUES ({placeholders})
        """
        
        self.cursor.execute(query, list(project_data.values()))
        self.conn.commit()
        return project_data.get('project_code')
    
    def get_project(self, project_code: str) -> Optional[Dict]:
        """Retrieve project information"""
        self.cursor.execute("""
        SELECT * FROM projects WHERE project_code = ?
        """, (project_code,))
        
        row = self.cursor.fetchone()
        return dict(row) if row else None
    
    def get_all_projects(self, status: str = 'Active') -> List[Dict]:
        """Get all projects with optional status filter"""
        if status:
            self.cursor.execute("""
            SELECT * FROM projects WHERE project_status = ?
            ORDER BY project_code
            """, (status,))
        else:
            self.cursor.execute("""
            SELECT * FROM projects 
            ORDER BY project_code
            """)
        
        return [dict(row) for row in self.cursor.fetchall()]
    
    # ========== PAY RATE OPERATIONS ==========
    
    def add_pay_rate(self, rate_data: Dict) -> int:
        """Add a new pay rate schedule"""
        columns = ', '.join(rate_data.keys())
        placeholders = ', '.join(['?' for _ in rate_data])
        
        query = f"""
        INSERT INTO pay_rates ({columns})
        VALUES ({placeholders})
        """
        
        self.cursor.execute(query, list(rate_data.values()))
        self.conn.commit()
        return self.cursor.lastrowid
    
    def get_current_pay_rate(self, craft_id: str, project_code: str = None, 
                            as_of_date: str = None) -> Optional[Dict]:
        """Get the applicable pay rate for a craft/project/date"""
        if as_of_date is None:
            as_of_date = datetime.now().date().isoformat()
        
        if project_code:
            self.cursor.execute("""
            SELECT * FROM pay_rates
            WHERE craft_id = ? 
            AND (project_code = ? OR project_code IS NULL)
            AND effective_date <= ?
            AND is_active = 1
            ORDER BY effective_date DESC, project_code DESC
            LIMIT 1
            """, (craft_id, project_code, as_of_date))
        else:
            self.cursor.execute("""
            SELECT * FROM pay_rates
            WHERE craft_id = ? 
            AND effective_date <= ?
            AND is_active = 1
            ORDER BY effective_date DESC
            LIMIT 1
            """, (craft_id, as_of_date))
        
        row = self.cursor.fetchone()
        return dict(row) if row else None
    
    # ========== PAYROLL RECORD OPERATIONS ==========
    
    def add_payroll_record(self, payroll_data: Dict) -> int:
        """Add a new payroll record"""
        
        # Calculate total hours if not provided
        if 'total_hours_all_projects' not in payroll_data:
            total_hours = sum([
                payroll_data.get(f'st_hrs_date{i}', 0) or 0 
                for i in range(1, 8)
            ])
            payroll_data['total_hours_all_projects'] = total_hours
        
        columns = ', '.join(payroll_data.keys())
        placeholders = ', '.join(['?' for _ in payroll_data])
        
        query = f"""
        INSERT INTO payroll_records ({columns})
        VALUES ({placeholders})
        """
        
        self.cursor.execute(query, list(payroll_data.values()))
        self.conn.commit()
        return self.cursor.lastrowid
    
    def update_payroll_record(self, payroll_number: int, updates: Dict) -> bool:
        """Update a payroll record"""
        updates['modified_date'] = datetime.now().isoformat()
        set_clause = ', '.join([f"{k} = ?" for k in updates.keys()])
        
        query = f"""
        UPDATE payroll_records 
        SET {set_clause}
        WHERE payroll_number = ?
        """
        
        self.cursor.execute(query, list(updates.values()) + [payroll_number])
        self.conn.commit()
        return self.cursor.rowcount > 0
    
    def get_payroll_record(self, payroll_number: int) -> Optional[Dict]:
        """Retrieve a specific payroll record"""
        self.cursor.execute("""
        SELECT * FROM payroll_records WHERE payroll_number = ?
        """, (payroll_number,))
        
        row = self.cursor.fetchone()
        return dict(row) if row else None
    
    # ========== CERTIFIED PAYROLL REPORTS ==========
    
    def get_weekly_certified_payroll(self, project_code: str, 
                                    week_end_date: str) -> List[Dict]:
        """Generate weekly certified payroll report"""
        query = """
        SELECT 
            pr.payroll_number,
            pr.project_code,
            p.contract_id,
            pr.work_order,
            pr.week_end_date,
            pr.check_num,
            e.ssn,
            pr.employee_id,
            pr.class_code,
            pr.gross_employee_pay,
            pr.all_projects,
            pr.wages_paid_in_lieu_of_fringes,
            pr.total_paid,
            pr.st_hrs_date1,
            pr.st_hrs_date2,
            pr.st_hrs_date3,
            pr.st_hrs_date4,
            pr.st_hrs_date5,
            pr.st_hrs_date6,
            pr.st_hrs_date7,
            pr.total_hours_all_projects as Total_Hours_All_Projects,
            pr.ep_haw,
            pr.ep_pension,
            pr.ep_vac_hol,
            pr.ep_train,
            pr.ep_all_other,
            pr.vol_cont_pension,
            pr.vol_emp_pay_med,
            pr.dts_fed_tax,
            pr.dts_fica,
            pr.dts_medicare,
            pr.dts_state_tax,
            pr.dts_sdi,
            pr.dts_dues,
            pr.dts_savings,
            pr.dts_other,
            pr.dts_total,
            pr.trav_subs,
            pr.pay_rate,
            pr.ot_rate,
            pr.double_ot_rate as "2OT_rate",
            pr.prnotes,
            pr.payment_date,
            e.first_name,
            e.last_name,
            e.address1,
            e.address2,
            e.city,
            e.state,
            e.zip as ZIP,
            e.phone,
            e.gender,
            e.ethnicity,
            e.apprentice_id,
            e.craft_id,
            pr.vac_chk_box,
            pr.fringe_paid_chk_box,
            e.date_hired,
            e.emp_status,
            p.work_county,
            e.is_foreman as IsForeman,
            e.is_disadvantaged as IsDisadvantaged,
            e.veteran_status as VeteranStatus,
            pr.other_deduction_notes as OtherDeductionNotes,
            e.num_exempt,
            e.drivers_license as DriversLicense,
            e.drivers_license_state as DriversLicenseState,
            e.owner_operator as Owner_Operator,
            e.i9_verified as I9Verified,
            p.geographic_ward as Geographic_Ward,
            p.geographic_area as Geographic_Area,
            p.congressional_district as Congressional_District,
            p.state_senate_district as State_Senate_District,
            pr.od_category as OD_Category,
            pr.od_type as OD_Type,
            pr.od_amount as OD_Amount,
            pr.fringes_provided_by_employer as FringesProvidedByEmployer,
            e.local_union_number as LocalUnionNumber,
            pr.ytd_sick_pay_time as YTD_SickPayTime,
            e.email as Email
        FROM payroll_records pr
        JOIN employees e ON pr.employee_id = e.employee_id
        JOIN projects p ON pr.project_code = p.project_code
        WHERE pr.project_code = ?
        AND pr.week_end_date = ?
        ORDER BY e.last_name, e.first_name
        """
        
        self.cursor.execute(query, (project_code, week_end_date))
        return [dict(row) for row in self.cursor.fetchall()]
    
    def get_employee_payroll_history(self, employee_id: str, 
                                    start_date: str = None, 
                                    end_date: str = None) -> List[Dict]:
        """Get payroll history for an employee"""
        query = """
        SELECT pr.*, p.project_name
        FROM payroll_records pr
        JOIN projects p ON pr.project_code = p.project_code
        WHERE pr.employee_id = ?
        """
        params = [employee_id]
        
        if start_date:
            query += " AND pr.week_end_date >= ?"
            params.append(start_date)
        
        if end_date:
            query += " AND pr.week_end_date <= ?"
            params.append(end_date)
        
        query += " ORDER BY pr.week_end_date DESC"
        
        self.cursor.execute(query, params)
        return [dict(row) for row in self.cursor.fetchall()]
    
    def get_project_labor_summary(self, project_code: str = None,
                                 start_date: str = None,
                                 end_date: str = None) -> List[Dict]:
        """Get labor cost summary by project"""
        query = """
        SELECT 
            pr.project_code,
            p.project_name,
            COUNT(DISTINCT pr.employee_id) as employee_count,
            SUM(pr.total_hours_all_projects) as total_hours,
            SUM(pr.gross_employee_pay) as gross_wages,
            SUM(pr.ep_haw + pr.ep_pension + pr.ep_vac_hol + 
                pr.ep_train + pr.ep_all_other) as total_benefits,
            SUM(pr.total_paid) as total_cost
        FROM payroll_records pr
        JOIN projects p ON pr.project_code = p.project_code
        WHERE 1=1
        """
        params = []
        
        if project_code:
            query += " AND pr.project_code = ?"
            params.append(project_code)
        
        if start_date:
            query += " AND pr.week_end_date >= ?"
            params.append(start_date)
        
        if end_date:
            query += " AND pr.week_end_date <= ?"
            params.append(end_date)
        
        query += """
        GROUP BY pr.project_code, p.project_name
        ORDER BY total_cost DESC
        """
        
        self.cursor.execute(query, params)
        return [dict(row) for row in self.cursor.fetchall()]
    
    # ========== UTILITY FUNCTIONS ==========
    
    def validate_payroll_record(self, payroll_data: Dict) -> Tuple[bool, List[str]]:
        """Validate payroll record data before insertion"""
        errors = []
        
        # Check required fields
        required = ['employee_id', 'project_code', 'week_end_date']
        for field in required:
            if field not in payroll_data or not payroll_data[field]:
                errors.append(f"Missing required field: {field}")
        
        # Validate hours
        for i in range(1, 8):
            hours = payroll_data.get(f'st_hrs_date{i}', 0) or 0
            if hours < 0 or hours > 24:
                errors.append(f"Invalid hours for date{i}: {hours}")
        
        # Validate total hours
        total = payroll_data.get('total_hours_all_projects', 0) or 0
        if total > 168:  # 7 days * 24 hours
            errors.append(f"Total weekly hours exceed 168: {total}")
        
        # Validate monetary amounts
        monetary_fields = ['gross_employee_pay', 'total_paid']
        for field in monetary_fields:
            if field in payroll_data:
                value = payroll_data[field] or 0
                if value < 0:
                    errors.append(f"Negative amount for {field}: {value}")
        
        return (len(errors) == 0, errors)
    
    def export_to_excel_format(self, records: List[Dict]) -> List[Dict]:
        """Format records for Excel export with all 88 columns"""
        # This ensures all 88 columns are present in the correct order
        column_order = [
            'payroll_number', 'project_code', 'contract_id', 'work_order',
            'week_end_date', 'check_num', 'ssn', 'employee_id', 'class_code',
            'gross_employee_pay', 'all_projects', 'wages_paid_in_lieu_of_fringes',
            'total_paid', 'st_hrs_date1', 'st_hrs_date2', 'st_hrs_date3',
            'st_hrs_date4', 'st_hrs_date5', 'st_hrs_date6', 'st_hrs_date7',
            'Total_Hours_All_Projects', 'ep_haw', 'ep_pension', 'ep_vac_hol',
            'ep_train', 'ep_all_other', 'vol_cont_pension', 'vol_emp_pay_med',
            'dts_fed_tax', 'dts_fica', 'dts_medicare', 'dts_state_tax',
            'dts_sdi', 'dts_dues', 'dts_savings', 'dts_other', 'dts_total',
            'trav_subs', 'pay_rate', 'OT_rate', '2OT_rate', 'prnotes',
            'payment_date', 'first_name', 'last_name', 'address1', 'address2',
            'city', 'state', 'zip', 'phone', 'gender', 'ethnicity',
            'apprentice_id', 'craft_id', 'vac_chk_box', 'fringe_paid_chk_box',
            'date_hired', 'emp_status', 'work_county', 'IsForeman',
            'IsDisadvantaged', 'VeteranStatus', 'OtherDeductionNotes',
            'num_exempt', 'DriversLicense', 'DriversLicenseState',
            'Owner_Operator', 'I9Verified', 'Geographic_Ward',
            'Geographic_Area', 'Congressional_District', 'State_Senate_District',
            'OD_Category', 'OD_Type', 'OD_Amount',
            'FringesProvidedByEmployer', 'LocalUnionNumber',
            'YTD_SickPayTime', 'Email'
        ]
        
        formatted_records = []
        for record in records:
            formatted = {}
            for col in column_order:
                # Handle column name mappings
                db_col = col.lower() if col not in ['2OT_rate'] else 'double_ot_rate'
                if col == 'Total_Hours_All_Projects':
                    db_col = 'total_hours_all_projects'
                elif col == 'OT_rate':
                    db_col = 'ot_rate'
                elif col == 'zip':
                    db_col = 'zip'
                    
                formatted[col] = record.get(db_col, '')
            formatted_records.append(formatted)
        
        return formatted_records
    
    def close(self):
        """Close database connection"""
        self.conn.close()
    
    def __enter__(self):
        """Context manager entry"""
        return self
    
    def __exit__(self, exc_type, exc_val, exc_tb):
        """Context manager exit"""
        self.close()


# ========== HELPER FUNCTIONS ==========

def calculate_pay(hours: float, base_rate: float, ot_rate: float = None,
                 double_ot_rate: float = None) -> Dict[str, float]:
    """Calculate gross pay with overtime"""
    if ot_rate is None:
        ot_rate = base_rate * 1.5
    if double_ot_rate is None:
        double_ot_rate = base_rate * 2.0
    
    regular_hours = min(hours, 40)
    ot_hours = min(max(hours - 40, 0), 12)  # Up to 12 hours OT
    double_ot_hours = max(hours - 52, 0)
    
    regular_pay = regular_hours * base_rate
    ot_pay = ot_hours * ot_rate
    double_ot_pay = double_ot_hours * double_ot_rate
    
    return {
        'regular_hours': regular_hours,
        'ot_hours': ot_hours,
        'double_ot_hours': double_ot_hours,
        'regular_pay': regular_pay,
        'ot_pay': ot_pay,
        'double_ot_pay': double_ot_pay,
        'gross_pay': regular_pay + ot_pay + double_ot_pay
    }


def calculate_deductions(gross_pay: float, marital_status: str = 'single',
                        exemptions: int = 0) -> Dict[str, float]:
    """Calculate standard payroll deductions"""
    # Simplified calculation - should use actual tax tables
    fed_tax = gross_pay * 0.12  # Federal withholding
    fica = gross_pay * 0.062    # Social Security
    medicare = gross_pay * 0.0145  # Medicare
    state_tax = gross_pay * 0.05  # State tax (varies by state)
    
    return {
        'dts_fed_tax': round(fed_tax, 2),
        'dts_fica': round(fica, 2),
        'dts_medicare': round(medicare, 2),
        'dts_state_tax': round(state_tax, 2),
        'dts_total': round(fed_tax + fica + medicare + state_tax, 2)
    }
