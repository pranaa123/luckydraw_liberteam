<?php

declare(strict_types=1);

namespace App\Core;

final class Router
{
    public function __construct(private readonly array $routes)
    {
    }

    public function dispatch(string $method, string $uri): void
    {
        $path = parse_url($uri, PHP_URL_PATH) ?: '/';
        $path = $path === '/' ? '/' : rtrim($path, '/');

        if (!isset($this->routes[$path])) {
            http_response_code(404);
            header('Content-Type: text/plain; charset=utf-8');
            echo 'Halaman tidak ditemukan.';
            return;
        }

        $route = $this->routes[$path];
        $methods = is_array($route) ? array_keys($route) : ['GET', 'HEAD'];
        if (!in_array($method, $methods, true)) {
            http_response_code(405);
            header('Allow: ' . implode(', ', $methods));
            return;
        }

        $handler = is_array($route) ? $route[$method] : $route;

        if ($method === 'HEAD') {
            ob_start();
            $handler();
            ob_end_clean();
            return;
        }

        $handler();
    }
}
