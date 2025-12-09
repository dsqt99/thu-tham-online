<?php

class RateLimiter
{
    private string $storeFile;
    private int $limitPerDay;

    public function __construct(string $storeFile = __DIR__ . '/../storage/usage.json', int $limitPerDay = 3)
    {
        $this->storeFile = $storeFile;
        $this->limitPerDay = $limitPerDay;

        $dir = dirname($this->storeFile);
        if (!is_dir($dir)) mkdir($dir, 0777, true);

        if (!file_exists($this->storeFile)) file_put_contents($this->storeFile, json_encode(new \stdClass()));
    }

    private function getIdentifier(): string
    {
        if (!empty($_COOKIE['tv_user'])) {
            $id = preg_replace('/[^a-zA-Z0-9_\-]/', '', $_COOKIE['tv_user']);
        } else {
            $id = $_SERVER['REMOTE_ADDR'] ?? 'anon';
        }
        return $id;
    }

    private function getKey(): string
    {
        $id = $this->getIdentifier();
        $date = date('Ymd');
        return "{$id}_{$date}";
    }

    private function readStore(): array
    {
        $fp = fopen($this->storeFile, 'c+');
        if (!$fp) return [];
        // lock shared for read
        flock($fp, LOCK_SH);
        $contents = stream_get_contents($fp);
        flock($fp, LOCK_UN);
        fclose($fp);
        $data = json_decode($contents, true);
        if (!is_array($data)) $data = [];
        return $data;
    }

    private function writeStore(array $data): bool
    {
        $fp = fopen($this->storeFile, 'c+');
        if (!$fp) return false;
        // exclusive lock to write
        flock($fp, LOCK_EX);
        ftruncate($fp, 0);
        rewind($fp);
        fwrite($fp, json_encode($data));
        fflush($fp);
        flock($fp, LOCK_UN);
        fclose($fp);
        return true;
    }

    public function getCount(): int
    {
        $data = $this->readStore();
        $key = $this->getKey();
        return isset($data[$key]) ? (int)$data[$key] : 0;
    }

    public function increment(): int
    {
        $fp = fopen($this->storeFile, 'c+');
        if (!$fp) return 0;
        flock($fp, LOCK_EX);
        $contents = stream_get_contents($fp);
        $data = json_decode($contents, true);
        if (!is_array($data)) $data = [];
        $key = $this->getKey();
        $count = isset($data[$key]) ? (int)$data[$key] : 0;
        $count++;
        $data[$key] = $count;
        // write back
        ftruncate($fp, 0);
        rewind($fp);
        fwrite($fp, json_encode($data));
        fflush($fp);
        flock($fp, LOCK_UN);
        fclose($fp);
        return $count;
    }

    public function allowed(): bool
    {
        return $this->getCount() < $this->limitPerDay;
    }

    public function ensureCookie(int $days = 30)
    {
        if (empty($_COOKIE['tv_user'])) {
            $token = bin2hex(random_bytes(10));
            setcookie('tv_user', $token, time() + ($days * 86400), '/', '', false, true);
            $_COOKIE['tv_user'] = $token; 
        }
    }
}
