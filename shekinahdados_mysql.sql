-- =====================================================
--  BANCO DE DADOS: Sistema de Escala Igreja Shekinah
--  Banco: MySQL 5.7+ / MariaDB
--  Criado para uso com PHP/Node.js ou qualquer backend
-- =====================================================

CREATE DATABASE IF NOT EXISTS shekinah_escala
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE shekinah_escala;

-- -----------------------------------------------------
-- TABELA: ministerios
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS ministerios (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  nome       VARCHAR(100) NOT NULL UNIQUE,
  ativo      TINYINT(1)   NOT NULL DEFAULT 1,
  criado_em  TIMESTAMP    DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO ministerios (nome) VALUES
  ('Diáconos'),
  ('EBD de Domingo'),
  ('Intercessão'),
  ('Recepção'),
  ('Louvor'),
  ('Mídia / Data show'),
  ('Coordenação de lanche EBD');

-- -----------------------------------------------------
-- TABELA: voluntarios
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS voluntarios (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  nome         VARCHAR(150)  NOT NULL,
  telefone     VARCHAR(20)   DEFAULT NULL,
  senha        VARCHAR(255)  NOT NULL DEFAULT '123',
  ativo        TINYINT(1)    NOT NULL DEFAULT 1,
  criado_em    TIMESTAMP     DEFAULT CURRENT_TIMESTAMP,
  atualizado_em TIMESTAMP    DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- -----------------------------------------------------
-- TABELA: voluntario_ministerios  (N:N)
-- Um voluntário pode atuar em vários ministérios
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS voluntario_ministerios (
  voluntario_id  INT NOT NULL,
  ministerio_id  INT NOT NULL,
  PRIMARY KEY (voluntario_id, ministerio_id),
  FOREIGN KEY (voluntario_id) REFERENCES voluntarios(id) ON DELETE CASCADE,
  FOREIGN KEY (ministerio_id) REFERENCES ministerios(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- -----------------------------------------------------
-- TABELA: disponibilidade
-- Períodos semanais em que o voluntário está disponível
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS disponibilidade (
  id             INT AUTO_INCREMENT PRIMARY KEY,
  voluntario_id  INT          NOT NULL,
  periodo        VARCHAR(50)  NOT NULL,
  -- Exemplos de período: 'domingo-manha', 'sabado-noite', etc.
  UNIQUE KEY uk_vol_periodo (voluntario_id, periodo),
  FOREIGN KEY (voluntario_id) REFERENCES voluntarios(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- -----------------------------------------------------
-- TABELA: indisponibilidade
-- Datas específicas em que o voluntário NÃO pode servir
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS indisponibilidade (
  id             INT AUTO_INCREMENT PRIMARY KEY,
  voluntario_id  INT          NOT NULL,
  data           DATE         NOT NULL,
  motivo         VARCHAR(255) DEFAULT NULL,
  UNIQUE KEY uk_vol_data (voluntario_id, data),
  FOREIGN KEY (voluntario_id) REFERENCES voluntarios(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- -----------------------------------------------------
-- TABELA: escalas
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS escalas (
  id             INT AUTO_INCREMENT PRIMARY KEY,
  ministerio_id  INT          NOT NULL,
  voluntario_id  INT          NOT NULL,
  data           DATE         NOT NULL,
  horario        VARCHAR(30)  NOT NULL DEFAULT 'Noite (19:00)',
  -- 'Manhã (09:00)', 'Tarde (14:00)', 'Noite (19:00)', 'Dia inteiro'
  funcao         VARCHAR(100) DEFAULT NULL,
  local_turma    VARCHAR(100) DEFAULT NULL,
  culto_evento   VARCHAR(150) DEFAULT NULL,
  observacoes    TEXT         DEFAULT NULL,
  criado_em      TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
  atualizado_em  TIMESTAMP    DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (ministerio_id) REFERENCES ministerios(id),
  FOREIGN KEY (voluntario_id) REFERENCES voluntarios(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Índice para buscas por data (relatórios, dashboard)
CREATE INDEX idx_escalas_data         ON escalas(data);
CREATE INDEX idx_escalas_voluntario   ON escalas(voluntario_id);
CREATE INDEX idx_escalas_ministerio   ON escalas(ministerio_id);

-- -----------------------------------------------------
-- TABELA: usuarios_admin
-- Administradores do sistema (separado dos voluntários)
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS usuarios_admin (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  nome       VARCHAR(150)  NOT NULL,
  usuario    VARCHAR(80)   NOT NULL UNIQUE,
  senha_hash VARCHAR(255)  NOT NULL,
  -- Use password_hash() no PHP ou bcrypt no Node.js
  ativo      TINYINT(1)    NOT NULL DEFAULT 1,
  criado_em  TIMESTAMP     DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Admin padrão (senha: 123 — TROQUE APÓS PRIMEIRO ACESSO)
INSERT INTO usuarios_admin (nome, usuario, senha_hash) VALUES
  ('Administrador', 'Admin', '$2y$10$YourHashedPasswordHere');
-- Para gerar o hash real em PHP: echo password_hash('123', PASSWORD_BCRYPT);

-- =====================================================
--  VIEWS ÚTEIS
-- =====================================================

-- View: próximas escalas com nome do voluntário e ministério
CREATE OR REPLACE VIEW v_proximas_escalas AS
SELECT
  e.id,
  e.data,
  e.horario,
  m.nome  AS ministerio,
  v.nome  AS voluntario,
  v.telefone,
  e.funcao,
  e.local_turma,
  e.culto_evento,
  e.observacoes
FROM escalas e
JOIN ministerios m ON m.id = e.ministerio_id
JOIN voluntarios v ON v.id = e.voluntario_id
WHERE e.data >= CURDATE()
ORDER BY e.data, e.horario;

-- View: voluntários com seus ministérios (concatenados)
CREATE OR REPLACE VIEW v_voluntarios_completos AS
SELECT
  v.id,
  v.nome,
  v.telefone,
  GROUP_CONCAT(m.nome ORDER BY m.nome SEPARATOR ', ') AS ministerios,
  COUNT(DISTINCT e.id) AS total_escalas
FROM voluntarios v
LEFT JOIN voluntario_ministerios vm ON vm.voluntario_id = v.id
LEFT JOIN ministerios m              ON m.id = vm.ministerio_id
LEFT JOIN escalas e                  ON e.voluntario_id = v.id
WHERE v.ativo = 1
GROUP BY v.id, v.nome, v.telefone;

-- =====================================================
--  EXEMPLOS DE CONSULTAS ÚTEIS
-- =====================================================

-- Detectar conflito de dupla escala (mesmo voluntário, mesma data, mesmo horário, dois ministérios)
/*
SELECT
  v.nome,
  e1.data,
  e1.horario,
  m1.nome AS ministerio_1,
  m2.nome AS ministerio_2
FROM escalas e1
JOIN escalas e2      ON e2.voluntario_id = e1.voluntario_id
                    AND e2.data          = e1.data
                    AND e2.horario       = e1.horario
                    AND e2.id            > e1.id
JOIN voluntarios v   ON v.id = e1.voluntario_id
JOIN ministerios m1  ON m1.id = e1.ministerio_id
JOIN ministerios m2  ON m2.id = e2.ministerio_id;
*/

-- Escalas de um voluntário nos próximos 30 dias
/*
SELECT e.data, m.nome AS ministerio, e.horario, e.funcao
FROM escalas e
JOIN ministerios m ON m.id = e.ministerio_id
WHERE e.voluntario_id = ?
  AND e.data BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL 30 DAY)
ORDER BY e.data;
*/

-- =====================================================
--  DADOS DE EXEMPLO (opcional — apague em produção)
-- =====================================================

INSERT INTO voluntarios (nome, telefone, senha) VALUES
  ('Maria Silva',    '(62) 99999-0001', '123'),
  ('João Souza',     '(62) 99999-0002', '123'),
  ('Ana Oliveira',   '(62) 99999-0003', '123'),
  ('Pedro Costa',    '(62) 99999-0004', '123');

-- Maria no ministério Louvor e Intercessão
INSERT INTO voluntario_ministerios (voluntario_id, ministerio_id)
SELECT v.id, m.id FROM voluntarios v, ministerios m
WHERE v.nome = 'Maria Silva' AND m.nome IN ('Louvor','Intercessão');

-- João no ministério Diáconos e Recepção
INSERT INTO voluntario_ministerios (voluntario_id, ministerio_id)
SELECT v.id, m.id FROM voluntarios v, ministerios m
WHERE v.nome = 'João Souza' AND m.nome IN ('Diáconos','Recepção');

-- Disponibilidade de Maria
INSERT INTO disponibilidade (voluntario_id, periodo)
SELECT v.id, p FROM voluntarios v, (
  SELECT 'domingo-manha' AS p UNION
  SELECT 'domingo-noite' UNION
  SELECT 'quarta-noite'
) periodos
WHERE v.nome = 'Maria Silva';

-- =====================================================
--  COMO CONECTAR NO PHP (exemplo)
-- =====================================================
/*
<?php
$host   = 'localhost';
$db     = 'shekinah_escala';
$user   = 'root';          // troque pelo seu usuário MySQL
$pass   = 'SuaSenha';      // troque pela sua senha
$charset= 'utf8mb4';

$dsn = "mysql:host=$host;dbname=$db;charset=$charset";
$pdo = new PDO($dsn, $user, $pass, [
    PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
    PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
    PDO::ATTR_EMULATE_PREPARES   => false,
]);

// Buscar próximas escalas
$stmt = $pdo->query('SELECT * FROM v_proximas_escalas LIMIT 20');
$escalas = $stmt->fetchAll();
echo json_encode($escalas);
?>
*/
