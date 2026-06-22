import Docker from 'dockerode';

const docker = new Docker({ socketPath: '//./pipe/docker_engine' });

export interface ContainerStat {
  name: string;
  cpu: number;
  memory: number;
  memUsed: number;
  memLimit: number;
  status: string;
}

export async function getDockerStats(): Promise<ContainerStat[]> {
  try {
    const containers = await docker.listContainers();

    const statsPromises = containers.map(async (container) => {
      const instance = docker.getContainer(container.Id);
      const name = container.Names[0]?.slice(1) ?? 'unknown';
      const status = container.Status;

      try {
        const stats = await instance.stats({ stream: false }) as any;

        const cpuDelta = stats.cpu_stats.cpu_usage.total_usage - stats.precpu_stats.cpu_usage.total_usage;
        const systemDelta = stats.cpu_stats.system_cpu_usage - stats.precpu_stats.system_cpu_usage;
        const numCpus = stats.cpu_stats.online_cpus || 1;
        const cpu = systemDelta > 0 ? (cpuDelta / systemDelta) * numCpus * 100 : 0;

        const memUsed = stats.memory_stats.usage - (stats.memory_stats.stats?.cache ?? 0);
        const memLimit = stats.memory_stats.limit;
        const memory = (memUsed / memLimit) * 100;

        return { name, cpu, memory, memUsed, memLimit, status };
      } catch {
        return { name, cpu: 0, memory: 0, memUsed: 0, memLimit: 0, status };
      }
    });

    return await Promise.all(statsPromises);
  } catch (error) {
    console.error('Error fetching Docker stats:', error);
    return [];
  }
}
