<?php
// =====================================================
//  API - Sistema de Escala Igreja Shekinah
//  Hospedagem: InfinityFree / MySQL
// =====================================================

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { exit(0); }

// ── CONFIGURAÇÃO DO BANCO ────────────────────────────
define('DB_HOST', 'sql102.infinityfree.com');
define('DB_NAME', 'if0_41425471_db_shekinah');
define('DB_USER', 'if0_41425471');
define('DB_PASS', 'NqCglQ8onP5obZo');

// ── CONEXÃO ──────────────────────────────────────────
try {
    $db = new PDO(
        'mysql:host='.DB_HOST.';dbname='.DB_NAME.';charset=utf8mb4',
        DB_USER, DB_PASS,
        [
            PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES   => false,
        ]
    );
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['erro' => 'Falha na conexao: ' . $e->getMessage()]);
    exit;
}

// ── ROTEAMENTO ───────────────────────────────────────
$rota   = $_GET['rota'] ?? '';
$metodo = $_SERVER['REQUEST_METHOD'];
$body   = json_decode(file_get_contents('php://input'), true) ?? [];

switch ($rota) {
    case 'login':             login($db, $body);                      break;
    case 'voluntarios':       voluntarios($db, $metodo, $body);       break;
    case 'escalas':           escalas($db, $metodo, $body);           break;
    case 'ministerios':       ministerios($db, $metodo, $body);       break;
    case 'disponibilidade':   disponibilidade($db, $metodo, $body);   break;
    case 'indisponibilidade': indisponibilidade($db, $metodo, $body); break;
    case 'trocas':            trocas($db, $metodo, $body);            break;
    case 'confirmar':         confirmarPresencaApi($db, $body);       break;
    case 'dashboard':         dashboard($db);                         break;
    case 'relatorio':         relatorio($db);                         break;
    default:
        http_response_code(404);
        echo json_encode(['erro' => 'Rota nao encontrada: ' . $rota]);
}

// ── LOGIN ────────────────────────────────────────────
function login($db, $body) {
    $perfil  = $body['perfil']  ?? '';
    $usuario = trim($body['usuario'] ?? '');
    $senha   = $body['senha']   ?? '';
    if ($perfil === 'admin') {
        $stmt = $db->prepare('SELECT * FROM usuarios_admin WHERE usuario = ? AND senha = ? AND ativo = 1');
        $stmt->execute([$usuario, $senha]);
        $r = $stmt->fetch();
        echo $r ? json_encode(['ok'=>true,'perfil'=>'admin','nome'=>$r['nome'],'id'=>$r['id']])
                : json_encode(['ok'=>false,'erro'=>'Usuario ou senha incorretos']);
    } elseif ($perfil === 'voluntario') {
        $stmt = $db->prepare('SELECT * FROM voluntarios WHERE LOWER(nome) = LOWER(?) AND senha = ? AND ativo = 1');
        $stmt->execute([$usuario, $senha]);
        $r = $stmt->fetch();
        echo $r ? json_encode(['ok'=>true,'perfil'=>'voluntario','nome'=>$r['nome'],'id'=>$r['id']])
                : json_encode(['ok'=>false,'erro'=>'Voluntario nao encontrado']);
    } else {
        echo json_encode(['ok'=>false,'erro'=>'Perfil invalido']);
    }
}

// ── VOLUNTÁRIOS ──────────────────────────────────────
function voluntarios($db, $metodo, $body) {
    $id = intval($_GET['id'] ?? 0);

    if ($metodo === 'GET') {
        $busca = $_GET['busca'] ?? '';
        $min   = $_GET['ministerio'] ?? '';
        $sql = 'SELECT v.*,
            GROUP_CONCAT(DISTINCT m.nome) AS ministerios_nomes,
            GROUP_CONCAT(DISTINCT d.periodo) AS disponibilidade_str,
            (SELECT COUNT(*) FROM escalas e WHERE e.voluntario_id = v.id) AS total_escalas
            FROM voluntarios v
            LEFT JOIN voluntario_ministerios vm ON vm.voluntario_id = v.id
            LEFT JOIN ministerios m ON m.id = vm.ministerio_id
            LEFT JOIN disponibilidade d ON d.voluntario_id = v.id
            WHERE v.ativo = 1';
        $params = [];
        if ($busca) { $sql .= ' AND LOWER(v.nome) LIKE ?'; $params[] = '%'.strtolower($busca).'%'; }
        if ($min)   { $sql .= ' AND m.nome = ?';            $params[] = $min; }
        $sql .= ' GROUP BY v.id ORDER BY v.nome';
        $stmt = $db->prepare($sql);
        $stmt->execute($params);
        $rows = $stmt->fetchAll();
        foreach ($rows as &$r) {
            $r['ministerios']     = $r['ministerios_nomes']    ? explode(',', $r['ministerios_nomes'])    : [];
            $r['disponibilidade'] = $r['disponibilidade_str']  ? explode(',', $r['disponibilidade_str'])  : [];
            $s2 = $db->prepare('SELECT id, data, motivo FROM indisponibilidade WHERE voluntario_id = ? ORDER BY data');
            $s2->execute([$r['id']]);
            $r['indisponibilidade'] = $s2->fetchAll();
            unset($r['ministerios_nomes'], $r['disponibilidade_str']);
        }
        echo json_encode($rows);

    } elseif ($metodo === 'POST') {
        $nome  = trim($body['nome']  ?? '');
        $tel   = trim($body['tel']   ?? '');
        $nasc  = $body['nasc']  ?: null;
        $senha = $body['senha'] ?? '123';
        $mins  = $body['ministerios'] ?? [];
        if (!$nome) { echo json_encode(['ok'=>false,'erro'=>'Nome obrigatorio']); return; }
        $db->beginTransaction();
        $db->prepare('INSERT INTO voluntarios (nome, telefone, data_nasc, senha) VALUES (?,?,?,?)')->execute([$nome,$tel,$nasc,$senha]);
        $novo_id = $db->lastInsertId();
        foreach ($mins as $mn) {
            $s2 = $db->prepare('SELECT id FROM ministerios WHERE nome = ?');
            $s2->execute([$mn]); $m = $s2->fetch();
            if ($m) $db->prepare('INSERT IGNORE INTO voluntario_ministerios (voluntario_id, ministerio_id) VALUES (?,?)')->execute([$novo_id,$m['id']]);
        }
        $db->commit();
        echo json_encode(['ok'=>true,'id'=>$novo_id]);

    } elseif ($metodo === 'PUT') {
        if (!$id) { echo json_encode(['ok'=>false,'erro'=>'ID obrigatorio']); return; }
        $nome  = trim($body['nome']  ?? '');
        $tel   = trim($body['tel']   ?? '');
        $nasc  = $body['nasc']  ?: null;
        $senha = $body['senha'] ?? '123';
        $mins  = $body['ministerios'] ?? [];
        $db->beginTransaction();
        $db->prepare('UPDATE voluntarios SET nome=?, telefone=?, data_nasc=?, senha=?, atualizado_em=NOW() WHERE id=?')->execute([$nome,$tel,$nasc,$senha,$id]);
        $db->prepare('DELETE FROM voluntario_ministerios WHERE voluntario_id = ?')->execute([$id]);
        foreach ($mins as $mn) {
            $s2 = $db->prepare('SELECT id FROM ministerios WHERE nome = ?');
            $s2->execute([$mn]); $m = $s2->fetch();
            if ($m) $db->prepare('INSERT IGNORE INTO voluntario_ministerios (voluntario_id, ministerio_id) VALUES (?,?)')->execute([$id,$m['id']]);
        }
        $db->commit();
        echo json_encode(['ok'=>true]);

    } elseif ($metodo === 'DELETE') {
        if (!$id) { echo json_encode(['ok'=>false,'erro'=>'ID obrigatorio']); return; }
        $db->prepare('UPDATE voluntarios SET ativo = 0 WHERE id = ?')->execute([$id]);
        echo json_encode(['ok'=>true]);
    }
}

// ── ESCALAS ──────────────────────────────────────────
function escalas($db, $metodo, $body) {
    $id = intval($_GET['id'] ?? 0);

    if ($metodo === 'GET') {
        $busca  = $_GET['busca']         ?? '';
        $min    = $_GET['ministerio']    ?? '';
        $data   = $_GET['data']          ?? '';
        $period = $_GET['periodo']       ?? '';
        $vol_id = intval($_GET['voluntario_id'] ?? 0);
        $today  = date('Y-m-d');

        $sql = 'SELECT e.*, m.nome AS ministerio, v.nome AS voluntario_nome, v.telefone AS voluntario_tel
                FROM escalas e
                JOIN ministerios m ON m.id = e.ministerio_id
                JOIN voluntarios v ON v.id = e.voluntario_id AND v.ativo = 1
                WHERE 1=1';
        $params = [];
        if ($busca)   { $sql .= ' AND LOWER(v.nome) LIKE ?'; $params[] = '%'.strtolower($busca).'%'; }
        if ($min)     { $sql .= ' AND m.nome = ?';            $params[] = $min; }
        if ($data)    { $sql .= ' AND e.data = ?';            $params[] = $data; }
        if ($vol_id)  { $sql .= ' AND e.voluntario_id = ?';  $params[] = $vol_id; }
        if ($period === 'futuras')  { $sql .= ' AND e.data >= CURDATE()'; }
        if ($period === 'passadas') { $sql .= ' AND e.data < CURDATE()'; }
        $sql .= ' ORDER BY e.data, e.horario';
        $stmt = $db->prepare($sql);
        $stmt->execute($params);
        echo json_encode($stmt->fetchAll());

    } elseif ($metodo === 'POST') {
        $mn     = $body['ministerio']    ?? '';
        $vol_id = intval($body['voluntario_id'] ?? 0);
        $data   = $body['data']          ?? '';
        $hor    = $body['horario']       ?? 'Noite (19:00)';
        $func   = $body['funcao']        ?? '';
        $local  = $body['local']         ?? '';
        $culto  = $body['culto']         ?? '';
        $obs    = $body['obs']           ?? '';
        if (!$mn||!$vol_id||!$data) { echo json_encode(['ok'=>false,'erro'=>'Campos obrigatorios faltando']); return; }
        $s2 = $db->prepare('SELECT id FROM ministerios WHERE nome = ?');
        $s2->execute([$mn]); $m = $s2->fetch();
        if (!$m) { echo json_encode(['ok'=>false,'erro'=>'Ministerio nao encontrado']); return; }
        $db->prepare('INSERT INTO escalas (ministerio_id,voluntario_id,data,horario,funcao,local_turma,culto_evento,observacoes) VALUES (?,?,?,?,?,?,?,?)')->execute([$m['id'],$vol_id,$data,$hor,$func,$local,$culto,$obs]);
        echo json_encode(['ok'=>true,'id'=>$db->lastInsertId()]);

    } elseif ($metodo === 'PUT') {
        if (!$id) { echo json_encode(['ok'=>false,'erro'=>'ID obrigatorio']); return; }
        $mn     = $body['ministerio']    ?? '';
        $vol_id = intval($body['voluntario_id'] ?? 0);
        $data   = $body['data']          ?? '';
        $hor    = $body['horario']       ?? '';
        $func   = $body['funcao']        ?? '';
        $local  = $body['local']         ?? '';
        $culto  = $body['culto']         ?? '';
        $obs    = $body['obs']           ?? '';
        $s2 = $db->prepare('SELECT id FROM ministerios WHERE nome = ?');
        $s2->execute([$mn]); $m = $s2->fetch();
        if (!$m) { echo json_encode(['ok'=>false,'erro'=>'Ministerio nao encontrado']); return; }
        $db->prepare('UPDATE escalas SET ministerio_id=?,voluntario_id=?,data=?,horario=?,funcao=?,local_turma=?,culto_evento=?,observacoes=? WHERE id=?')->execute([$m['id'],$vol_id,$data,$hor,$func,$local,$culto,$obs,$id]);
        echo json_encode(['ok'=>true]);

    } elseif ($metodo === 'DELETE') {
        if (!$id) { echo json_encode(['ok'=>false,'erro'=>'ID obrigatorio']); return; }
        $db->prepare('DELETE FROM escalas WHERE id = ?')->execute([$id]);
        echo json_encode(['ok'=>true]);
    }
}

// ── MINISTÉRIOS ──────────────────────────────────────
function ministerios($db, $metodo, $body) {
    $id = intval($_GET['id'] ?? 0);
    if ($metodo === 'GET') {
        $stmt = $db->query('SELECT m.*,
            (SELECT COUNT(DISTINCT vm.voluntario_id) FROM voluntario_ministerios vm JOIN voluntarios v ON v.id = vm.voluntario_id WHERE vm.ministerio_id = m.id AND v.ativo = 1) AS total_voluntarios,
            (SELECT COUNT(*) FROM escalas e WHERE e.ministerio_id = m.id) AS total_escalas
            FROM ministerios m WHERE m.ativo = 1 ORDER BY m.nome');
        echo json_encode($stmt->fetchAll());
    } elseif ($metodo === 'POST') {
        $nome = trim($body['nome'] ?? '');
        if (!$nome) { echo json_encode(['ok'=>false,'erro'=>'Nome obrigatorio']); return; }
        $db->prepare('INSERT INTO ministerios (nome) VALUES (?)')->execute([$nome]);
        echo json_encode(['ok'=>true,'id'=>$db->lastInsertId()]);
    } elseif ($metodo === 'DELETE') {
        if (!$id) { echo json_encode(['ok'=>false,'erro'=>'ID obrigatorio']); return; }
        $db->prepare('UPDATE ministerios SET ativo = 0 WHERE id = ?')->execute([$id]);
        echo json_encode(['ok'=>true]);
    }
}

// ── DISPONIBILIDADE ──────────────────────────────────
function disponibilidade($db, $metodo, $body) {
    $vol_id = intval($body['voluntario_id'] ?? $_GET['voluntario_id'] ?? 0);
    if ($metodo === 'GET') {
        $stmt = $db->prepare('SELECT periodo FROM disponibilidade WHERE voluntario_id = ?');
        $stmt->execute([$vol_id]);
        echo json_encode(array_column($stmt->fetchAll(), 'periodo'));
    } elseif ($metodo === 'POST') {
        $periodos = $body['periodos'] ?? [];
        $db->beginTransaction();
        $db->prepare('DELETE FROM disponibilidade WHERE voluntario_id = ?')->execute([$vol_id]);
        $stmt = $db->prepare('INSERT INTO disponibilidade (voluntario_id, periodo) VALUES (?,?)');
        foreach ($periodos as $p) $stmt->execute([$vol_id, $p]);
        $db->commit();
        echo json_encode(['ok'=>true]);
    }
}

// ── INDISPONIBILIDADE ────────────────────────────────
function indisponibilidade($db, $metodo, $body) {
    $vol_id = intval($body['voluntario_id'] ?? $_GET['voluntario_id'] ?? 0);
    $id     = intval($_GET['id'] ?? 0);
    if ($metodo === 'GET') {
        $stmt = $db->prepare('SELECT * FROM indisponibilidade WHERE voluntario_id = ? ORDER BY data');
        $stmt->execute([$vol_id]);
        echo json_encode($stmt->fetchAll());
    } elseif ($metodo === 'POST') {
        $data   = $body['data']   ?? '';
        $motivo = $body['motivo'] ?? '';
        if (!$data||!$vol_id) { echo json_encode(['ok'=>false,'erro'=>'Data e voluntario obrigatorios']); return; }
        $db->prepare('INSERT IGNORE INTO indisponibilidade (voluntario_id, data, motivo) VALUES (?,?,?)')->execute([$vol_id,$data,$motivo]);
        echo json_encode(['ok'=>true,'id'=>$db->lastInsertId()]);
    } elseif ($metodo === 'DELETE') {
        if (!$id) { echo json_encode(['ok'=>false,'erro'=>'ID obrigatorio']); return; }
        $db->prepare('DELETE FROM indisponibilidade WHERE id = ?')->execute([$id]);
        echo json_encode(['ok'=>true]);
    }
}

// ── DASHBOARD ────────────────────────────────────────
function dashboard($db) {
    $today = date('Y-m-d');
    $total_vol  = $db->query('SELECT COUNT(*) FROM voluntarios WHERE ativo=1')->fetchColumn();
    $total_esc  = $db->query('SELECT COUNT(*) FROM escalas')->fetchColumn();
    $total_min  = $db->query('SELECT COUNT(*) FROM ministerios WHERE ativo=1')->fetchColumn();
    $proximas   = $db->query("SELECT COUNT(*) FROM escalas WHERE data >= '$today'")->fetchColumn();
    $stmt = $db->prepare('SELECT e.data, e.horario, e.funcao, m.nome AS ministerio, v.nome AS voluntario
        FROM escalas e
        JOIN ministerios m ON m.id = e.ministerio_id
        JOIN voluntarios v ON v.id = e.voluntario_id AND v.ativo = 1
        WHERE e.data >= ? ORDER BY e.data LIMIT 10');
    $stmt->execute([$today]);
    $lista = $stmt->fetchAll();
    $conflitos = $db->query('SELECT COUNT(*) FROM (
        SELECT e1.voluntario_id FROM escalas e1
        JOIN escalas e2 ON e1.voluntario_id=e2.voluntario_id AND e1.data=e2.data AND e1.horario=e2.horario AND e1.id < e2.id
    ) x')->fetchColumn();
    echo json_encode([
        'total_voluntarios' => (int)$total_vol,
        'total_escalas'     => (int)$total_esc,
        'total_ministerios' => (int)$total_min,
        'proximas'          => (int)$proximas,
        'conflitos'         => (int)$conflitos,
        'proximas_lista'    => $lista,
    ]);
}

// ── RELATÓRIO ────────────────────────────────────────
function relatorio($db) {
    $ranking = $db->query('SELECT v.nome, COUNT(e.id) AS total
        FROM voluntarios v LEFT JOIN escalas e ON e.voluntario_id = v.id
        WHERE v.ativo = 1 GROUP BY v.id ORDER BY total DESC')->fetchAll();
    $por_min = $db->query('SELECT m.nome, COUNT(e.id) AS total
        FROM ministerios m LEFT JOIN escalas e ON e.ministerio_id = m.id
        WHERE m.ativo = 1 GROUP BY m.id ORDER BY total DESC')->fetchAll();
    echo json_encode(['ranking'=>$ranking,'por_ministerio'=>$por_min]);
}

// ── TROCAS ───────────────────────────────────────────
function trocas($db, $metodo, $body) {
    $id = intval($_GET['id'] ?? 0);

    if ($metodo === 'GET') {
        // Admin busca todas as pendentes; voluntário busca as suas
        $vol_id = intval($_GET['voluntario_id'] ?? 0);
        $sql = 'SELECT t.*, e.data AS escala_data, e.horario AS escala_horario,
                    e.culto_evento, m.nome AS ministerio, v.nome AS voluntario_nome
                FROM solicitacoes_troca t
                JOIN escalas e ON e.id = t.escala_id
                JOIN ministerios m ON m.id = e.ministerio_id
                JOIN voluntarios v ON v.id = t.voluntario_id
                WHERE 1=1';
        $params = [];
        if ($vol_id) { $sql .= ' AND t.voluntario_id = ?'; $params[] = $vol_id; }
        $sql .= ' ORDER BY t.criado_em DESC';
        $stmt = $db->prepare($sql);
        $stmt->execute($params);
        echo json_encode($stmt->fetchAll());

    } elseif ($metodo === 'POST') {
        $escala_id  = intval($body['escala_id']     ?? 0);
        $vol_id     = intval($body['voluntario_id'] ?? 0);
        $motivo     = trim($body['motivo']          ?? '');
        if (!$escala_id || !$vol_id) { echo json_encode(['ok'=>false,'erro'=>'Dados incompletos']); return; }
        // Evita duplicata pendente
        $dup = $db->prepare("SELECT id FROM solicitacoes_troca WHERE escala_id=? AND voluntario_id=? AND status='pendente'");
        $dup->execute([$escala_id, $vol_id]);
        if ($dup->fetch()) { echo json_encode(['ok'=>false,'erro'=>'Ja existe solicitacao pendente para esta escala']); return; }
        $db->prepare('INSERT INTO solicitacoes_troca (escala_id, voluntario_id, motivo) VALUES (?,?,?)')->execute([$escala_id,$vol_id,$motivo]);
        // Marca status na escala
        $db->prepare("UPDATE escalas SET status='troca_solicitada' WHERE id=?")->execute([$escala_id]);
        echo json_encode(['ok'=>true,'id'=>$db->lastInsertId()]);

    } elseif ($metodo === 'PUT') {
        // Admin resolve ou recusa
        if (!$id) { echo json_encode(['ok'=>false,'erro'=>'ID obrigatorio']); return; }
        $novo_status = $body['status'] ?? 'resolvido';
        $db->beginTransaction();
        $db->prepare('UPDATE solicitacoes_troca SET status=? WHERE id=?')->execute([$novo_status, $id]);
        // Se resolvido: REMOVE a escala do voluntário
        if ($novo_status === 'resolvido') {
            $t = $db->prepare('SELECT escala_id, voluntario_id FROM solicitacoes_troca WHERE id=?');
            $t->execute([$id]); $tr = $t->fetch();
            if ($tr) {
                // Deleta a escala completamente
                $db->prepare('DELETE FROM escalas WHERE id=?')->execute([$tr['escala_id']]);
            }
        }
        $db->commit();
        echo json_encode(['ok'=>true]);
    }
}


// ── CONFIRMAR PRESENÇA ───────────────────────────────
function confirmarPresencaApi($db, $body) {
    $escala_id  = intval($body['escala_id']     ?? 0);
    $vol_id     = intval($body['voluntario_id'] ?? 0);
    if (!$escala_id || !$vol_id) { echo json_encode(['ok'=>false,'erro'=>'Dados incompletos']); return; }
    $db->prepare("UPDATE escalas SET status='confirmado' WHERE id=? AND voluntario_id=?")->execute([$escala_id, $vol_id]);
    echo json_encode(['ok'=>true]);
}
