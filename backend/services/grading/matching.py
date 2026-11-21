"""One-to-one maximum-weight bipartite matching via SPFA min-cost max-flow."""

from collections import deque
from collections.abc import Mapping, Sequence


_WEIGHT_SCALE = 1_000_000_000
_INF = 10**18


def match_one_to_one(
    weights: Mapping[tuple[int, int], float],
    node_count: int,
    defect_indices: Sequence[int],
) -> dict[int, int]:
    """Find a maximum-weight 1-to-1 matching from left nodes to defect indices.

    Args:
        weights: Mapping of (left_node_idx, defect_idx) to positive edge weight.
        node_count: Number of left-side nodes (0 .. node_count - 1).
        defect_indices: Sequence of right-side defect indices.

    Returns:
        Mapping of matched defect_idx -> left_node_idx.
    """
    if node_count <= 0 or not defect_indices or not weights:
        return {}

    num_u = node_count
    num_d = len(defect_indices)
    d_idx_to_pos = {d_idx: pos for pos, d_idx in enumerate(defect_indices)}

    source = 0
    sink = 1 + num_u + num_d
    total_nodes = sink + 1
    adj: list[list[list[int]]] = [[] for _ in range(total_nodes)]

    def add_edge(frm: int, to: int, cap: int, cost: int) -> None:
        adj[frm].append([to, cap, cost, len(adj[to])])
        adj[to].append([frm, 0, -cost, len(adj[frm]) - 1])

    for u_pos in range(num_u):
        add_edge(source, 1 + u_pos, 1, 0)

    for d_pos in range(num_d):
        add_edge(1 + num_u + d_pos, sink, 1, 0)

    for (u_pos, d_idx), weight in weights.items():
        if not (0 <= u_pos < num_u) or d_idx not in d_idx_to_pos:
            continue
        scaled = int(round(weight * _WEIGHT_SCALE))
        if scaled <= 0:
            continue
        d_pos = d_idx_to_pos[d_idx]
        add_edge(1 + u_pos, 1 + num_u + d_pos, 1, -scaled)

    # Successive shortest augmenting path (SPFA) maximizes total weight.
    while True:
        dist = [_INF] * total_nodes
        in_queue = [False] * total_nodes
        parent_node = [-1] * total_nodes
        parent_edge = [-1] * total_nodes
        dist[source] = 0
        queue: deque[int] = deque([source])
        in_queue[source] = True

        while queue:
            u = queue.popleft()
            in_queue[u] = False
            for idx, edge in enumerate(adj[u]):
                v, cap, cost, _ = edge
                if cap > 0 and dist[u] + cost < dist[v]:
                    dist[v] = dist[u] + cost
                    parent_node[v] = u
                    parent_edge[v] = idx
                    if not in_queue[v]:
                        queue.append(v)
                        in_queue[v] = True

        if dist[sink] >= 0 or parent_node[sink] == -1:
            break

        curr = sink
        while curr != source:
            p = parent_node[curr]
            e_idx = parent_edge[curr]
            rev_idx = adj[p][e_idx][3]
            adj[p][e_idx][1] -= 1
            adj[curr][rev_idx][1] += 1
            curr = p

    assigned: dict[int, int] = {}
    for u_pos in range(num_u):
        u_node = 1 + u_pos
        for edge in adj[u_node]:
            v, cap, _, _ = edge
            if cap == 0 and 1 + num_u <= v < sink:
                d_pos = v - (1 + num_u)
                assigned[defect_indices[d_pos]] = u_pos
                break

    return assigned
