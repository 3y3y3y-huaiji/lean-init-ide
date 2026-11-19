;; 纯浏览器级 JSPI 探针：不经过 Emscripten。
;; 每 interval 层调用一次 env.suspend，JS 侧用 WebAssembly.Suspending 包装它，
;; 导出函数用 WebAssembly.promising 包装。
;;
;; 两个参数决定这次测量是否有意义：
;;   interval   挂起密度；若挂起能真正回收栈，上界应随 interval 放大。
;;   forceAsync 0 = 已决议 Promise（V8 快路径）；1 = 微任务决议；2 = 宏任务决议。
(module
  (import "env" "suspend" (func $suspend (param i32) (result i32)))
  (func $rec (export "yield_probe")
    (param $n i32) (param $interval i32) (param $forceAsync i32)
    (result i32)
    (local $inner i32)
    (if
      (i32.and
        (i32.gt_s (local.get $n) (i32.const 0))
        (i32.eqz (i32.rem_u (local.get $n) (local.get $interval)))
      )
      (then
        ;; 传负的 forceAsync，JS 侧据此决定返回哪种 Promise。
        (drop
          (call $suspend
            (i32.sub (i32.const 0) (local.get $forceAsync))
          )
        )
      )
    )
    (if (i32.eqz (local.get $n))
      (then (return (i32.const 0)))
    )
    (local.set $inner
      (call $rec
        (i32.sub (local.get $n) (i32.const 1))
        (local.get $interval)
        (local.get $forceAsync)
      )
    )
    (i32.add (local.get $inner) (i32.const 1))
  )
)
