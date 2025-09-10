'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { 
  Activity, 
  Database, 
  Server, 
  AlertTriangle, 
  CheckCircle, 
  Clock, 
  Zap,
  RefreshCw,
  TrendingUp,
  Shield
} from 'lucide-react';

interface ReliabilityData {
  health: {
    overall: {
      status: 'healthy' | 'degraded' | 'critical';
      score: number;
      issues: string[];
    };
    redis: any;
    database: any;
    circuitBreakers: any;
  };
  performance: {
    processingTime: number;
    target: number;
    isWithinSLA: boolean;
    metrics: any;
  };
  activity: {
    recent: any;
    timestamp: string;
  };
  reliability: {
    webhookProcessingReliability: number;
    connectionStability: number;
    systemUptime: number;
    errorRate: number;
  };
  metadata: {
    generatedAt: string;
    queryTime: number;
  };
}

export default function ReliabilityMonitoringDashboard() {
  const [data, setData] = useState<ReliabilityData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

  const fetchReliabilityData = useCallback(async () => {
    try {
      setError(null);
      const response = await fetch('/api/monitoring/reliability', {
        cache: 'no-cache',
        headers: {
          'Cache-Control': 'no-cache'
        }
      });
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const reliabilityData = await response.json();
      setData(reliabilityData);
      setLastUpdate(new Date());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch monitoring data');
      console.error('Failed to fetch reliability data:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchReliabilityData();
  }, [fetchReliabilityData]);

  useEffect(() => {
    if (!autoRefresh) return;
    
    const interval = setInterval(fetchReliabilityData, 10000); // 10 seconds
    return () => clearInterval(interval);
  }, [autoRefresh, fetchReliabilityData]);

  const getHealthStatusColor = (status: string) => {
    switch (status) {
      case 'healthy': return 'text-green-600 bg-green-100';
      case 'degraded': return 'text-yellow-600 bg-yellow-100';
      case 'critical': return 'text-red-600 bg-red-100';
      default: return 'text-gray-600 bg-gray-100';
    }
  };

  const getHealthIcon = (status: string) => {
    switch (status) {
      case 'healthy': return <CheckCircle className="h-4 w-4" />;
      case 'degraded': return <AlertTriangle className="h-4 w-4" />;
      case 'critical': return <AlertTriangle className="h-4 w-4" />;
      default: return <Activity className="h-4 w-4" />;
    }
  };

  const formatUptime = (seconds: number) => {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    
    if (days > 0) return `${days}d ${hours}h ${minutes}m`;
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
  };

  if (loading && !data) {
    return (
      <div className="p-6">
        <div className="flex items-center justify-center h-64">
          <div className="flex items-center space-x-2">
            <RefreshCw className="h-6 w-6 animate-spin" />
            <span>Loading reliability monitoring...</span>
          </div>
        </div>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="p-6">
        <Card className="border-red-200 bg-red-50">
          <CardContent className="p-6">
            <div className="flex items-center space-x-2 text-red-600">
              <AlertTriangle className="h-5 w-5" />
              <span className="font-medium">Monitoring Error</span>
            </div>
            <p className="mt-2 text-sm text-red-600">{error}</p>
            <Button 
              onClick={fetchReliabilityData} 
              className="mt-4"
              variant="outline"
              size="sm"
            >
              <RefreshCw className="h-4 w-4 mr-2" />
              Retry
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Reliability Monitoring</h1>
          <p className="text-sm text-gray-600 mt-1">
            Real-time webhook processing health and performance metrics
          </p>
        </div>
        <div className="flex items-center space-x-4">
          <div className="text-xs text-gray-500">
            Last updated: {lastUpdate?.toLocaleTimeString() || 'Never'}
          </div>
          <Button
            onClick={() => setAutoRefresh(!autoRefresh)}
            variant={autoRefresh ? 'default' : 'outline'}
            size="sm"
          >
            {autoRefresh ? 'Auto' : 'Manual'}
          </Button>
          <Button onClick={fetchReliabilityData} variant="outline" size="sm">
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Overall Health Status */}
      {data && (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <Shield className="h-5 w-5" />
                <span>Overall System Health</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center space-x-3">
                  <Badge className={getHealthStatusColor(data.health.overall.status)}>
                    {getHealthIcon(data.health.overall.status)}
                    <span className="ml-2 capitalize">{data.health.overall.status}</span>
                  </Badge>
                  <span className="text-2xl font-bold">{data.health.overall.score}%</span>
                </div>
                <div className="text-right">
                  <div className="text-sm text-gray-600">System Uptime</div>
                  <div className="font-medium">{formatUptime(data.reliability.systemUptime)}</div>
                </div>
              </div>
              
              <Progress value={data.health.overall.score} className="mb-3" />
              
              {data.health.overall.issues.length > 0 && (
                <div className="mt-3">
                  <div className="text-sm font-medium text-gray-700 mb-2">Active Issues:</div>
                  <div className="space-y-1">
                    {data.health.overall.issues.map((issue, index) => (
                      <div key={index} className="flex items-center space-x-2 text-sm text-red-600">
                        <AlertTriangle className="h-3 w-3" />
                        <span>{issue}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Performance Metrics Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {/* Processing Time SLA */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center space-x-2 text-sm">
                  <Clock className="h-4 w-4" />
                  <span>Response Time</span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-baseline space-x-2">
                  <span className="text-2xl font-bold">
                    {data.performance.processingTime}ms
                  </span>
                  <Badge variant={data.performance.isWithinSLA ? 'default' : 'destructive'}>
                    {data.performance.isWithinSLA ? 'Within SLA' : 'SLA Breach'}
                  </Badge>
                </div>
                <div className="text-xs text-gray-600 mt-1">
                  Target: &lt;{data.performance.target}ms
                </div>
                <Progress 
                  value={Math.min((data.performance.processingTime / data.performance.target) * 100, 100)} 
                  className="mt-2"
                />
              </CardContent>
            </Card>

            {/* Webhook Reliability */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center space-x-2 text-sm">
                  <TrendingUp className="h-4 w-4" />
                  <span>Processing Reliability</span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {data.reliability.webhookProcessingReliability.toFixed(1)}%
                </div>
                <div className="text-xs text-gray-600 mt-1">Success rate</div>
                <Progress value={data.reliability.webhookProcessingReliability} className="mt-2" />
              </CardContent>
            </Card>

            {/* Connection Stability */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center space-x-2 text-sm">
                  <Database className="h-4 w-4" />
                  <span>Connection Stability</span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {data.reliability.connectionStability.toFixed(0)}%
                </div>
                <div className="text-xs text-gray-600 mt-1">Redis + Database</div>
                <Progress value={data.reliability.connectionStability} className="mt-2" />
              </CardContent>
            </Card>

            {/* Error Rate */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center space-x-2 text-sm">
                  <AlertTriangle className="h-4 w-4" />
                  <span>Error Rate</span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {data.reliability.errorRate.toFixed(1)}%
                </div>
                <div className="text-xs text-gray-600 mt-1">Failed operations</div>
                <Progress 
                  value={Math.min(data.reliability.errorRate, 100)} 
                  className="mt-2"
                  color={data.reliability.errorRate > 5 ? 'red' : 'green'}
                />
              </CardContent>
            </Card>
          </div>

          {/* Connection Health Details */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Redis Health */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                  <Server className="h-5 w-5" />
                  <span>Redis Connection</span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-600">Status</span>
                    <Badge variant={data.health.redis.connected ? 'default' : 'destructive'}>
                      {data.health.redis.connected ? 'Connected' : 'Disconnected'}
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-600">Provider</span>
                    <span className="text-sm font-medium">{data.health.redis.provider}</span>
                  </div>
                  {data.health.redis.averageLatency && (
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600">Avg Latency</span>
                      <span className="text-sm font-medium">{data.health.redis.averageLatency.toFixed(0)}ms</span>
                    </div>
                  )}
                  {data.health.circuitBreakers.redis && (
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600">Circuit Breaker</span>
                      <Badge variant={data.health.circuitBreakers.redis.state === 'CLOSED' ? 'default' : 'destructive'}>
                        {data.health.circuitBreakers.redis.state}
                      </Badge>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Database Health */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                  <Database className="h-5 w-5" />
                  <span>Database Connection</span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-600">Status</span>
                    <Badge variant={data.health.database.connectionManager?.isHealthy ? 'default' : 'destructive'}>
                      {data.health.database.connectionManager?.isHealthy ? 'Healthy' : 'Unhealthy'}
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-600">Active Connections</span>
                    <span className="text-sm font-medium">
                      {data.health.database.connectionManager?.connectionCount || 0}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-600">Avg Latency</span>
                    <span className="text-sm font-medium">
                      {data.health.database.connectionManager?.averageLatency?.toFixed(0) || 0}ms
                    </span>
                  </div>
                  {data.health.database.circuitBreaker && (
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600">Circuit Breaker</span>
                      <Badge variant={data.health.database.circuitBreaker.state === 'CLOSED' ? 'default' : 'destructive'}>
                        {data.health.database.circuitBreaker.state}
                      </Badge>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Recent Activity */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <Activity className="h-5 w-5" />
                <span>Recent Activity (Last Hour)</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="text-center">
                  <div className="text-2xl font-bold text-blue-600">
                    {data.activity.recent.recentWebhooks || 0}
                  </div>
                  <div className="text-xs text-gray-600">Webhooks Received</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-green-600">
                    {data.activity.recent.processedWebhooks || 0}
                  </div>
                  <div className="text-xs text-gray-600">Successfully Processed</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-red-600">
                    {data.activity.recent.failedWebhooks || 0}
                  </div>
                  <div className="text-xs text-gray-600">Failed</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-yellow-600">
                    {data.activity.recent.queueLength || 0}
                  </div>
                  <div className="text-xs text-gray-600">Queue Length</div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Footer */}
          <div className="text-xs text-gray-500 text-center">
            Monitoring data generated at {new Date(data.metadata.generatedAt).toLocaleString()} 
            (Query time: {data.metadata.queryTime}ms)
          </div>
        </>
      )}
    </div>
  );
}