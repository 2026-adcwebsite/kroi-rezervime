-- ============================================
-- KROI Agroturizëm & Restorant - Database
-- ============================================

CREATE DATABASE IF NOT EXISTS kroi_rezervime CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE kroi_rezervime;

-- ------------------------------------------------
-- TAVOLINAT (të brendshme dhe terraca)
-- ------------------------------------------------
CREATE TABLE IF NOT EXISTS tavolinat (
    id          INT AUTO_INCREMENT PRIMARY KEY,
    numri       VARCHAR(5) NOT NULL UNIQUE,       -- "1", "2", ... "14"
    zona        ENUM('indoor','outdoor') NOT NULL,
    kapaciteti  INT NOT NULL,
    forma       ENUM('round','rect') NOT NULL,
    aktive      TINYINT(1) DEFAULT 1
) ENGINE=InnoDB;

INSERT INTO tavolinat (numri, zona, kapaciteti, forma) VALUES
('1',  'indoor',  2, 'round'),
('2',  'indoor',  2, 'round'),
('3',  'indoor',  4, 'rect'),
('4',  'indoor',  4, 'rect'),
('5',  'indoor',  6, 'rect'),
('6',  'indoor',  6, 'rect'),
('7',  'indoor',  8, 'rect'),
('8',  'indoor',  4, 'round'),
('9',  'outdoor', 2, 'round'),
('10', 'outdoor', 2, 'round'),
('11', 'outdoor', 4, 'rect'),
('12', 'outdoor', 4, 'rect'),
('13', 'outdoor', 6, 'rect'),
('14', 'outdoor', 6, 'rect');

-- ------------------------------------------------
-- REZERVIMET E TAVOLINAVE
-- ------------------------------------------------
CREATE TABLE IF NOT EXISTS rezervimet_tavolina (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    tavolina_id     INT NOT NULL,
    emri            VARCHAR(120) NOT NULL,
    telefon         VARCHAR(30) NOT NULL,
    email           VARCHAR(120),
    persona         INT NOT NULL DEFAULT 2,
    data_rez        DATE NOT NULL,
    ora_rez         TIME NOT NULL,
    ora_mbarim      TIME NOT NULL,            -- ora_rez + 2h automatikisht
    kerkesa         TEXT,
    statusi         ENUM('aktive','anuluar','perfunduar') DEFAULT 'aktive',
    krijuar_me      DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (tavolina_id) REFERENCES tavolinat(id)
) ENGINE=InnoDB;

-- ------------------------------------------------
-- KABINAT
-- ------------------------------------------------
CREATE TABLE IF NOT EXISTS kabinat (
    id          INT AUTO_INCREMENT PRIMARY KEY,
    kodi        VARCHAR(10) NOT NULL UNIQUE,   -- "K1", "K2", ...
    emri        VARCHAR(80) NOT NULL,
    lloji       ENUM('standard','deluxe','familje','honeymoon') NOT NULL,
    kapaciteti  INT NOT NULL,
    cmimi_nate  DECIMAL(10,2) NOT NULL,
    pershkrimi  TEXT,
    aktive      TINYINT(1) DEFAULT 1
) ENGINE=InnoDB;

INSERT INTO kabinat (kodi, emri, lloji, kapaciteti, cmimi_nate, pershkrimi) VALUES
('K1', 'Kabina Lisi',    'standard',  2, 6500.00, 'Kabinë romantike me pamje malit'),
('K2', 'Kabina Bliri',   'standard',  2, 6500.00, 'Qetësi totale në pyllin e blirit'),
('K3', 'Kabina Malësia', 'deluxe',    4, 9800.00, 'Eksperiencë luksoze malore'),
('K4', 'Kabina Familja', 'familje',   6,14000.00, 'Ideale për familje të mëdha'),
('K5', 'Kabina Mjalti',  'honeymoon', 2,12000.00, 'Destinacioni perfekt për çifte'),
('K6', 'Kabina Burim',   'deluxe',    3, 8500.00, 'Afër burimit të freskët të lumit');

-- ------------------------------------------------
-- REZERVIMET E KABINAVE
-- ------------------------------------------------
CREATE TABLE IF NOT EXISTS rezervimet_kabina (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    kabina_id       INT NOT NULL,
    emri            VARCHAR(120) NOT NULL,
    telefon         VARCHAR(30) NOT NULL,
    email           VARCHAR(120),
    persona         INT NOT NULL DEFAULT 2,
    check_in        DATE NOT NULL,
    check_out       DATE NOT NULL,
    netet           INT GENERATED ALWAYS AS (DATEDIFF(check_out, check_in)) STORED,
    totali          DECIMAL(10,2),
    kerkesa         TEXT,
    statusi         ENUM('aktive','anuluar','perfunduar') DEFAULT 'aktive',
    krijuar_me      DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (kabina_id) REFERENCES kabinat(id)
) ENGINE=InnoDB;

-- ------------------------------------------------
-- INDEX për queries të shpeshta
-- ------------------------------------------------
CREATE INDEX idx_rez_tav_data   ON rezervimet_tavolina(data_rez, statusi);
CREATE INDEX idx_rez_kab_dates  ON rezervimet_kabina(check_in, check_out, statusi);
