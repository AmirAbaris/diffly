package cache

import (
	"sync"
	"time"
)

type cacheItem struct {
	value      any
	accessedAt time.Time
}

type LRUCache struct {
	mu       sync.Mutex
	items    map[string]cacheItem
	capacity int
}

func NewLRUCache(capacity int) *LRUCache {
	return &LRUCache{
		items:    make(map[string]cacheItem),
		capacity: capacity,
	}
}

// evictOldest removes the least recently accessed item.
func (c *LRUCache) evictOldest() {
	c.mu.Lock()
	defer c.mu.Unlock()

	var oldestKey string
	var oldestTime time.Time

	for key, item := range c.items {
		if oldestKey == "" || item.accessedAt.Before(oldestTime) {
			oldestKey = key
			oldestTime = item.accessedAt
		}
	}
	if oldestKey != "" {
		delete(c.items, oldestKey)
	}
}

// Set stores a value and evicts old entries if capacity is reached.
func (c *LRUCache) Set(key string, val any) {
	c.mu.Lock()
	defer c.mu.Unlock()

	if len(c.items) >= c.capacity {
		// Call evictOldest while already holding c.mu
		c.evictOldest()
	}

	c.items[key] = cacheItem{
		value:      val,
		accessedAt: time.Now(),
	}
}
