-- Mission Vector Check It - Vector Scheduling private data schema
-- Code/schema may live in the public repository. Real schedule/person/history data must not.

PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;

CREATE TABLE IF NOT EXISTS schema_info (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

INSERT OR IGNORE INTO schema_info(key,value) VALUES ('schema_version','1');

CREATE TABLE IF NOT EXISTS people (
    person_id TEXT PRIMARY KEY,
    display_name TEXT NOT NULL,
    person_kind TEXT NOT NULL CHECK (person_kind IN ('firefighter','command','other')),
    command_role TEXT,
    active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1)),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS settings (
    setting_key TEXT PRIMARY KEY,
    setting_value TEXT,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS rotation_history (
    rotation_id INTEGER PRIMARY KEY AUTOINCREMENT,
    shift_date TEXT NOT NULL,
    shift_label TEXT,
    person_id TEXT NOT NULL REFERENCES people(person_id),
    detail TEXT NOT NULL,
    credit TEXT CHECK (credit IS NULL OR credit IN ('Firefighter','Swing','Tiller','TADE')),
    verified INTEGER NOT NULL DEFAULT 1 CHECK (verified IN (0,1)),
    source TEXT NOT NULL,
    observed_at TEXT,
    plan_credit TEXT CHECK (plan_credit IS NULL OR plan_credit IN ('Firefighter','Swing','Tiller','TADE')),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE(shift_date,person_id)
);

CREATE INDEX IF NOT EXISTS idx_rotation_history_date ON rotation_history(shift_date);
CREATE INDEX IF NOT EXISTS idx_rotation_history_person_date ON rotation_history(person_id,shift_date);

CREATE TABLE IF NOT EXISTS duty_history (
    duty_id INTEGER PRIMARY KEY AUTOINCREMENT,
    shift_date TEXT NOT NULL,
    person_id TEXT NOT NULL REFERENCES people(person_id),
    detail TEXT NOT NULL,
    source TEXT NOT NULL,
    created_at TEXT NOT NULL,
    UNIQUE(shift_date,person_id,detail,source)
);

CREATE INDEX IF NOT EXISTS idx_duty_history_person_date ON duty_history(person_id,shift_date);

CREATE TABLE IF NOT EXISTS plans (
    plan_id INTEGER PRIMARY KEY AUTOINCREMENT,
    shift_date TEXT NOT NULL,
    person_id TEXT NOT NULL REFERENCES people(person_id),
    credit TEXT NOT NULL CHECK (credit IN ('Firefighter','Swing','Tiller','TADE')),
    scenario TEXT,
    block_start_date TEXT,
    created_at TEXT NOT NULL,
    source TEXT NOT NULL,
    superseded_at TEXT,
    UNIQUE(shift_date,person_id)
);

CREATE INDEX IF NOT EXISTS idx_plans_date ON plans(shift_date);

CREATE TABLE IF NOT EXISTS observations (
    observation_id INTEGER PRIMARY KEY AUTOINCREMENT,
    shift_date TEXT NOT NULL,
    shift_label TEXT,
    person_id TEXT NOT NULL REFERENCES people(person_id),
    captured_at TEXT NOT NULL,
    raw_text TEXT,
    duty_code TEXT,
    assignment TEXT,
    found INTEGER NOT NULL DEFAULT 1 CHECK (found IN (0,1)),
    source TEXT NOT NULL,
    candidate_key TEXT NOT NULL DEFAULT 'primary',
    shift_start TEXT,
    shift_end TEXT,
    duration_hours REAL,
    payload_json TEXT,
    UNIQUE(shift_date,person_id,captured_at,source,candidate_key)
);

CREATE INDEX IF NOT EXISTS idx_observations_person_date ON observations(person_id,shift_date,captured_at);

CREATE TABLE IF NOT EXISTS reviews (
    review_id INTEGER PRIMARY KEY AUTOINCREMENT,
    shift_date TEXT NOT NULL,
    person_id TEXT NOT NULL REFERENCES people(person_id),
    observation_captured_at TEXT,
    plan_credit TEXT CHECK (plan_credit IS NULL OR plan_credit IN ('Firefighter','Swing','Tiller','TADE')),
    status TEXT NOT NULL,
    detail TEXT,
    credit TEXT CHECK (credit IS NULL OR credit IN ('Firefighter','Swing','Tiller','TADE')),
    reason TEXT,
    source TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE(shift_date,person_id,observation_captured_at)
);

CREATE INDEX IF NOT EXISTS idx_reviews_status_date ON reviews(status,shift_date);

CREATE TABLE IF NOT EXISTS resolutions (
    resolution_id INTEGER PRIMARY KEY AUTOINCREMENT,
    shift_date TEXT NOT NULL,
    person_id TEXT NOT NULL REFERENCES people(person_id),
    resolution_detail TEXT NOT NULL,
    credit TEXT CHECK (credit IS NULL OR credit IN ('Firefighter','Swing','Tiller','TADE')),
    resolved_at TEXT NOT NULL,
    source TEXT NOT NULL,
    note TEXT
);

CREATE INDEX IF NOT EXISTS idx_resolutions_person_date ON resolutions(person_id,shift_date,resolved_at);

CREATE TABLE IF NOT EXISTS acquisition_runs (
    run_id INTEGER PRIMARY KEY AUTOINCREMENT,
    source TEXT NOT NULL,
    range_start TEXT,
    range_end TEXT,
    started_at TEXT NOT NULL,
    completed_at TEXT,
    status TEXT NOT NULL,
    etag TEXT,
    raw_evidence_path TEXT,
    imported_observations INTEGER NOT NULL DEFAULT 0,
    error_text TEXT
);

CREATE TABLE IF NOT EXISTS planner_runs (
    planner_run_id INTEGER PRIMARY KEY AUTOINCREMENT,
    created_at TEXT NOT NULL,
    block_start_date TEXT NOT NULL,
    horizon_blocks_requested INTEGER NOT NULL,
    horizon_blocks_used INTEGER NOT NULL,
    current_fairness REAL,
    selected_first_assignment_json TEXT,
    final_projected_fairness REAL,
    evidence_summary_json TEXT,
    engine_version TEXT,
    note TEXT
);
