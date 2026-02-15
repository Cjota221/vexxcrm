import { NextRequest, NextResponse } from 'next/server';
import { getTenantFromRequest } from '@/lib/auth-helpers';
import os from 'os';

/**
 * GET /api/admin/vps-health
 * 
 * Monitora saúde do servidor (CPU, RAM, uptime).
 * Retorna alerta se uso passar de 80%.
 * 
 * Apenas para admins/owners.
 */
export async function GET(request: NextRequest) {
  try {
    const { profile } = await getTenantFromRequest(request);

    // Apenas owner/admin pode ver saúde do servidor
    if (!['owner', 'admin'].includes(profile.role)) {
      return NextResponse.json(
        { error: 'Permissão negada' },
        { status: 403 }
      );
    }

    // ━━━ CPU ━━━
    const cpus = os.cpus();
    const cpuCount = cpus.length;

    // Calcular uso médio de CPU
    let totalIdle = 0;
    let totalTick = 0;
    for (const cpu of cpus) {
      const times = cpu.times;
      totalIdle += times.idle;
      totalTick += times.user + times.nice + times.sys + times.idle + times.irq;
    }
    const cpuUsagePercent = totalTick > 0
      ? Math.round(((totalTick - totalIdle) / totalTick) * 100)
      : 0;

    // ━━━ RAM ━━━
    const totalMemory = os.totalmem();
    const freeMemory = os.freemem();
    const usedMemory = totalMemory - freeMemory;
    const memoryUsagePercent = Math.round((usedMemory / totalMemory) * 100);

    // ━━━ UPTIME ━━━
    const uptimeSeconds = os.uptime();
    const uptimeDays = Math.floor(uptimeSeconds / 86400);
    const uptimeHours = Math.floor((uptimeSeconds % 86400) / 3600);

    // ━━━ ALERTAS ━━━
    const alerts: { level: 'warning' | 'critical'; message: string }[] = [];

    if (memoryUsagePercent > 90) {
      alerts.push({
        level: 'critical',
        message: `⚠️ RAM CRÍTICA: ${memoryUsagePercent}% em uso. Risco de OOM!`,
      });
    } else if (memoryUsagePercent > 80) {
      alerts.push({
        level: 'warning',
        message: `🟡 RAM alta: ${memoryUsagePercent}% em uso. Considere otimizar.`,
      });
    }

    if (cpuUsagePercent > 90) {
      alerts.push({
        level: 'critical',
        message: `⚠️ CPU CRÍTICA: ${cpuUsagePercent}% de uso.`,
      });
    } else if (cpuUsagePercent > 80) {
      alerts.push({
        level: 'warning',
        message: `🟡 CPU alta: ${cpuUsagePercent}% de uso.`,
      });
    }

    // ━━━ INSTÂNCIAS EVOLUTION ━━━
    let evolutionStatus = 'unknown';
    try {
      const apiUrl = process.env.EVOLUTION_API_URL;
      const apiKey = process.env.EVOLUTION_GLOBAL_KEY || process.env.EVOLUTION_API_KEY;
      if (apiUrl && apiKey) {
        const res = await fetch(`${apiUrl}/instance/fetchInstances`, {
          headers: { 'apikey': apiKey },
          signal: AbortSignal.timeout(5000),
        });
        if (res.ok) {
          const instances = await res.json();
          evolutionStatus = `${Array.isArray(instances) ? instances.length : 0} instâncias`;
        } else {
          evolutionStatus = 'erro na API';
        }
      } else {
        evolutionStatus = 'não configurado';
      }
    } catch {
      evolutionStatus = 'timeout/offline';
    }

    const formatBytes = (bytes: number) => {
      const gb = bytes / (1024 * 1024 * 1024);
      return `${gb.toFixed(1)} GB`;
    };

    return NextResponse.json({
      success: true,
      health: {
        status: alerts.some(a => a.level === 'critical')
          ? 'critical'
          : alerts.some(a => a.level === 'warning')
            ? 'warning'
            : 'healthy',
        cpu: {
          cores: cpuCount,
          usage_percent: cpuUsagePercent,
          model: cpus[0]?.model || 'Unknown',
        },
        memory: {
          total: formatBytes(totalMemory),
          used: formatBytes(usedMemory),
          free: formatBytes(freeMemory),
          usage_percent: memoryUsagePercent,
        },
        uptime: {
          days: uptimeDays,
          hours: uptimeHours,
          formatted: `${uptimeDays}d ${uptimeHours}h`,
        },
        evolution: {
          status: evolutionStatus,
        },
        platform: {
          os: `${os.type()} ${os.release()}`,
          arch: os.arch(),
          hostname: os.hostname(),
          node: process.version,
        },
        alerts,
        checked_at: new Date().toISOString(),
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Erro interno';
    console.error('[VPS Health] Erro:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
