-- ============================================
-- KROI Agroturizëm & Restorant - Database v2
-- ============================================

CREATE DATABASE IF NOT EXISTS kroi_rezervime CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE kroi_rezervime;

-- ------------------------------------------------
-- TAVOLINAT
-- ------------------------------------------------
CREATE TABLE IF NOT EXISTS tavolinat (
    id          INT AUTO_INCREMENT PRIMARY KEY,
    numri       VARCHAR(5) NOT NULL UNIQUE,
    zona        ENUM('indoor','outdoor') NOT NULL,
    kapaciteti  INT NOT NULL,
    forma       ENUM('round','rect') NOT NULL,
    aktive      TINYINT(1) DEFAULT 1
) ENGINE=InnoDB;

INSERT IGNORE INTO tavolinat (numri, zona, kapaciteti, forma) VALUES
('1','indoor',2,'round'),('2','indoor',2,'round'),
('3','indoor',4,'rect'),('4','indoor',4,'rect'),
('5','indoor',6,'rect'),('6','indoor',6,'rect'),
('7','indoor',8,'rect'),('8','indoor',4,'round'),
('9','outdoor',2,'round'),('10','outdoor',2,'round'),
('11','outdoor',4,'rect'),('12','outdoor',4,'rect'),
('13','outdoor',6,'rect'),('14','outdoor',6,'rect');

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
    ora_mbarim      TIME NOT NULL,
    kerkesa         TEXT,
    burim           ENUM('online','admin') DEFAULT 'online',
    statusi         ENUM('aktive','anuluar','perfunduar') DEFAULT 'aktive',
    krijuar_me      DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (tavolina_id) REFERENCES tavolinat(id)
) ENGINE=InnoDB;

-- ------------------------------------------------
-- KABINAT
-- ------------------------------------------------
CREATE TABLE IF NOT EXISTS kabinat (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    kodi            VARCHAR(10) NOT NULL UNIQUE,
    emri            VARCHAR(80) NOT NULL,
    emri_en         VARCHAR(80),
    lloji           ENUM('standard','deluxe','familje','honeymoon') NOT NULL,
    kapaciteti      INT NOT NULL,
    cmimi_nate      DECIMAL(10,2) NOT NULL,        -- çmimi bazë (ditë pune)
    cmimi_fundjavë  DECIMAL(10,2),                 -- çmimi E Shtunë/Diel (NULL = same)
    pershkrimi      TEXT,
    pershkrimi_en   TEXT,
    foto_kryesore   VARCHAR(255),                  -- path i fotos kryesore
    aktive          TINYINT(1) DEFAULT 1
) ENGINE=InnoDB;

INSERT IGNORE INTO kabinat (kodi, emri, emri_en, lloji, kapaciteti, cmimi_nate, cmimi_fundjavë, pershkrimi, pershkrimi_en) VALUES
('K1','Kabina Lisi',   'Lisi Cabin',    'standard',  2,  6500.00,  8000.00, 'Kabinë romantike me pamje malit dhe liqenit', 'Romantic cabin with mountain and lake views'),
('K2','Kabina Bliri',  'Bliri Cabin',   'standard',  2,  6500.00,  8000.00, 'Qetësi totale në pyllin e blirit', 'Total tranquility in the linden forest'),
('K3','Kabina Malësia','Malësia Cabin', 'deluxe',    4,  9800.00, 12000.00, 'Eksperiencë luksoze malore me sauna dhe jacuzzi', 'Luxury mountain experience with sauna and jacuzzi'),
('K4','Kabina Familja','Family Cabin',  'familje',   6, 14000.00, 16000.00, 'Ideale për familje të mëdha, 2 dhoma gjumi', 'Ideal for large families, 2 bedrooms'),
('K5','Kabina Mjalti', 'Honey Cabin',   'honeymoon', 2, 12000.00, 14000.00, 'Destinacioni perfekt për çifte të samartuara', 'The perfect destination for newlyweds'),
('K6','Kabina Burim',  'Burim Cabin',   'deluxe',    3,  8500.00, 10500.00, 'Afër burimit të freskët, terracë panoramike', 'Near the fresh spring, panoramic terrace');

-- ------------------------------------------------
-- FOTOT E KABINAVE
-- ------------------------------------------------
CREATE TABLE IF NOT EXISTS kabina_fotot (
    id          INT AUTO_INCREMENT PRIMARY KEY,
    kabina_id   INT NOT NULL,
    filename    VARCHAR(255) NOT NULL,
    caption     VARCHAR(200),
    renditja    INT DEFAULT 0,
    krijuar_me  DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (kabina_id) REFERENCES kabinat(id)
) ENGINE=InnoDB;

-- ------------------------------------------------
-- ÇMIMET SPECIALE (periudha/sezone)
-- ------------------------------------------------
CREATE TABLE IF NOT EXISTS cmime_speciale (
    id          INT AUTO_INCREMENT PRIMARY KEY,
    kabina_id   INT NOT NULL,
    data_fillim DATE NOT NULL,
    data_mbarim DATE NOT NULL,
    cmimi       DECIMAL(10,2) NOT NULL,
    pershkrimi  VARCHAR(100),                      -- p.sh. "Sezona e Verës", "Krishtlindjet"
    FOREIGN KEY (kabina_id) REFERENCES kabinat(id)
) ENGINE=InnoDB;

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
    burim           ENUM('online','admin') DEFAULT 'online',
    statusi         ENUM('aktive','anuluar','perfunduar') DEFAULT 'aktive',
    krijuar_me      DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (kabina_id) REFERENCES kabinat(id)
) ENGINE=InnoDB;

-- ------------------------------------------------
-- INDEKSET
-- ------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_rez_tav_data  ON rezervimet_tavolina(data_rez, statusi);
CREATE INDEX IF NOT EXISTS idx_rez_kab_dates ON rezervimet_kabina(check_in, check_out, statusi);
CREATE INDEX IF NOT EXISTS idx_kabina_fotot  ON kabina_fotot(kabina_id, renditja);
CREATE INDEX IF NOT EXISTS idx_cmime_spec    ON cmime_speciale(kabina_id, data_fillim, data_mbarim);
