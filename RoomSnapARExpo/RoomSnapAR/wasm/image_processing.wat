;; WebAssembly Text Format for Image Processing
;; Compile with: wat2wasm image_processing.wat -o image_processing.wasm

(module
  ;; Memory: 1 page = 64KB, max 256 pages = 16MB
  (memory (export "memory") 1 256)
  
  ;; Function to allocate memory
  (func $allocate (export "allocate") (param $size i32) (result i32)
    (local $ptr i32)
    ;; Simple bump allocator
    (global.get $heap_ptr)
    (local.set $ptr)
    (global.set $heap_ptr
      (i32.add (local.get $ptr) (local.get $size))
    )
    (local.get $ptr)
  )
  
  ;; Function to deallocate memory (no-op for bump allocator)
  (func $deallocate (export "deallocate") (param $ptr i32)
    ;; No-op for simple bump allocator
  )
  
  ;; Sobel edge detection
  (func $processImage (export "processImage") 
    (param $ptr i32) (param $width i32) (param $height i32)
    (local $x i32)
    (local $y i32)
    (local $idx i32)
    (local $gx f32)
    (local $gy f32)
    (local $magnitude f32)
    
    ;; Loop through pixels (skip borders)
    (local.set $y (i32.const 1))
    (block $y_break
      (loop $y_loop
        (br_if $y_break (i32.ge_u (local.get $y) 
          (i32.sub (local.get $height) (i32.const 1))))
        
        (local.set $x (i32.const 1))
        (block $x_break
          (loop $x_loop
            (br_if $x_break (i32.ge_u (local.get $x) 
              (i32.sub (local.get $width) (i32.const 1))))
            
            ;; Calculate pixel index
            (local.set $idx
              (i32.mul
                (i32.add
                  (i32.mul (local.get $y) (local.get $width))
                  (local.get $x)
                )
                (i32.const 4)
              )
            )
            
            ;; Apply Sobel operator
            (local.set $gx (call $sobelX 
              (local.get $ptr) (local.get $x) (local.get $y) (local.get $width)))
            (local.set $gy (call $sobelY 
              (local.get $ptr) (local.get $x) (local.get $y) (local.get $width)))
            
            ;; Calculate magnitude
            (local.set $magnitude
              (f32.sqrt
                (f32.add
                  (f32.mul (local.get $gx) (local.get $gx))
                  (f32.mul (local.get $gy) (local.get $gy))
                )
              )
            )
            
            ;; Clamp to 0-255
            (if (f32.gt (local.get $magnitude) (f32.const 255))
              (local.set $magnitude (f32.const 255))
            )
            
            ;; Write result (grayscale edge)
            (i32.store8 
              (i32.add (local.get $ptr) (local.get $idx))
              (i32.trunc_f32_u (local.get $magnitude))
            )
            (i32.store8 
              (i32.add (local.get $ptr) (i32.add (local.get $idx) (i32.const 1)))
              (i32.trunc_f32_u (local.get $magnitude))
            )
            (i32.store8 
              (i32.add (local.get $ptr) (i32.add (local.get $idx) (i32.const 2)))
              (i32.trunc_f32_u (local.get $magnitude))
            )
            
            ;; Increment x
            (local.set $x (i32.add (local.get $x) (i32.const 1)))
            (br $x_loop)
          )
        )
        
        ;; Increment y
        (local.set $y (i32.add (local.get $y) (i32.const 1)))
        (br $y_loop)
      )
    )
  )
  
  ;; Sobel X kernel
  (func $sobelX (param $ptr i32) (param $x i32) (param $y i32) (param $width i32) (result f32)
    (local $sum f32)
    (local $idx i32)
    
    ;; Top-left
    (local.set $idx (call $getPixelIndex 
      (i32.sub (local.get $x) (i32.const 1))
      (i32.sub (local.get $y) (i32.const 1))
      (local.get $width)
    ))
    (local.set $sum (f32.neg (f32.convert_i32_u 
      (i32.load8_u (i32.add (local.get $ptr) (local.get $idx))))))
    
    ;; Top-right
    (local.set $idx (call $getPixelIndex 
      (i32.add (local.get $x) (i32.const 1))
      (i32.sub (local.get $y) (i32.const 1))
      (local.get $width)
    ))
    (local.set $sum (f32.add (local.get $sum)
      (f32.convert_i32_u (i32.load8_u (i32.add (local.get $ptr) (local.get $idx))))))
    
    ;; Middle-left
    (local.set $idx (call $getPixelIndex 
      (i32.sub (local.get $x) (i32.const 1))
      (local.get $y)
      (local.get $width)
    ))
    (local.set $sum (f32.sub (local.get $sum)
      (f32.mul (f32.const 2)
        (f32.convert_i32_u (i32.load8_u (i32.add (local.get $ptr) (local.get $idx)))))))
    
    ;; Middle-right
    (local.set $idx (call $getPixelIndex 
      (i32.add (local.get $x) (i32.const 1))
      (local.get $y)
      (local.get $width)
    ))
    (local.set $sum (f32.add (local.get $sum)
      (f32.mul (f32.const 2)
        (f32.convert_i32_u (i32.load8_u (i32.add (local.get $ptr) (local.get $idx)))))))
    
    ;; Bottom-left
    (local.set $idx (call $getPixelIndex 
      (i32.sub (local.get $x) (i32.const 1))
      (i32.add (local.get $y) (i32.const 1))
      (local.get $width)
    ))
    (local.set $sum (f32.sub (local.get $sum)
      (f32.convert_i32_u (i32.load8_u (i32.add (local.get $ptr) (local.get $idx))))))
    
    ;; Bottom-right
    (local.set $idx (call $getPixelIndex 
      (i32.add (local.get $x) (i32.const 1))
      (i32.add (local.get $y) (i32.const 1))
      (local.get $width)
    ))
    (local.set $sum (f32.add (local.get $sum)
      (f32.convert_i32_u (i32.load8_u (i32.add (local.get $ptr) (local.get $idx))))))
    
    (local.get $sum)
  )
  
  ;; Sobel Y kernel
  (func $sobelY (param $ptr i32) (param $x i32) (param $y i32) (param $width i32) (result f32)
    (local $sum f32)
    (local $idx i32)
    
    ;; Top-left
    (local.set $idx (call $getPixelIndex 
      (i32.sub (local.get $x) (i32.const 1))
      (i32.sub (local.get $y) (i32.const 1))
      (local.get $width)
    ))
    (local.set $sum (f32.neg (f32.convert_i32_u 
      (i32.load8_u (i32.add (local.get $ptr) (local.get $idx))))))
    
    ;; Top-middle
    (local.set $idx (call $getPixelIndex 
      (local.get $x)
      (i32.sub (local.get $y) (i32.const 1))
      (local.get $width)
    ))
    (local.set $sum (f32.sub (local.get $sum)
      (f32.mul (f32.const 2)
        (f32.convert_i32_u (i32.load8_u (i32.add (local.get $ptr) (local.get $idx)))))))
    
    ;; Top-right
    (local.set $idx (call $getPixelIndex 
      (i32.add (local.get $x) (i32.const 1))
      (i32.sub (local.get $y) (i32.const 1))
      (local.get $width)
    ))
    (local.set $sum (f32.sub (local.get $sum)
      (f32.convert_i32_u (i32.load8_u (i32.add (local.get $ptr) (local.get $idx))))))
    
    ;; Bottom-left
    (local.set $idx (call $getPixelIndex 
      (i32.sub (local.get $x) (i32.const 1))
      (i32.add (local.get $y) (i32.const 1))
      (local.get $width)
    ))
    (local.set $sum (f32.add (local.get $sum)
      (f32.convert_i32_u (i32.load8_u (i32.add (local.get $ptr) (local.get $idx))))))
    
    ;; Bottom-middle
    (local.set $idx (call $getPixelIndex 
      (local.get $x)
      (i32.add (local.get $y) (i32.const 1))
      (local.get $width)
    ))
    (local.set $sum (f32.add (local.get $sum)
      (f32.mul (f32.const 2)
        (f32.convert_i32_u (i32.load8_u (i32.add (local.get $ptr) (local.get $idx)))))))
    
    ;; Bottom-right
    (local.set $idx (call $getPixelIndex 
      (i32.add (local.get $x) (i32.const 1))
      (i32.add (local.get $y) (i32.const 1))
      (local.get $width)
    ))
    (local.set $sum (f32.add (local.get $sum)
      (f32.convert_i32_u (i32.load8_u (i32.add (local.get $ptr) (local.get $idx))))))
    
    (local.get $sum)
  )
  
  ;; Helper function to calculate pixel index
  (func $getPixelIndex (param $x i32) (param $y i32) (param $width i32) (result i32)
    (i32.mul
      (i32.add
        (i32.mul (local.get $y) (local.get $width))
        (local.get $x)
      )
      (i32.const 4) ;; 4 bytes per pixel (RGBA)
    )
  )
  
  ;; Gaussian blur (3x3 kernel)
  (func $gaussianBlur (export "gaussianBlur")
    (param $ptr i32) (param $width i32) (param $height i32)
    (local $x i32)
    (local $y i32)
    (local $idx i32)
    (local $sum f32)
    (local $kernel_sum f32)
    
    ;; Gaussian kernel values (normalized)
    ;; 1 2 1
    ;; 2 4 2
    ;; 1 2 1
    (local.set $kernel_sum (f32.const 16))
    
    ;; Process each pixel
    (local.set $y (i32.const 1))
    (loop $y_loop
      (local.set $x (i32.const 1))
      (loop $x_loop
        ;; Apply Gaussian kernel
        (local.set $sum (call $applyGaussian
          (local.get $ptr) (local.get $x) (local.get $y) (local.get $width)))
        
        ;; Normalize and write result
        (local.set $idx (call $getPixelIndex 
          (local.get $x) (local.get $y) (local.get $width)))
        
        (i32.store8
          (i32.add (local.get $ptr) (local.get $idx))
          (i32.trunc_f32_u (f32.div (local.get $sum) (local.get $kernel_sum)))
        )
        
        (local.set $x (i32.add (local.get $x) (i32.const 1)))
        (br_if $x_loop (i32.lt_u (local.get $x) 
          (i32.sub (local.get $width) (i32.const 1))))
      )
      
      (local.set $y (i32.add (local.get $y) (i32.const 1)))
      (br_if $y_loop (i32.lt_u (local.get $y) 
        (i32.sub (local.get $height) (i32.const 1))))
    )
  )
  
  ;; Apply Gaussian kernel at position
  (func $applyGaussian (param $ptr i32) (param $x i32) (param $y i32) (param $width i32) (result f32)
    (local $sum f32)
    (local $idx i32)
    
    ;; Apply 3x3 Gaussian kernel
    ;; Top row
    (local.set $idx (call $getPixelIndex 
      (i32.sub (local.get $x) (i32.const 1))
      (i32.sub (local.get $y) (i32.const 1))
      (local.get $width)))
    (local.set $sum (f32.convert_i32_u 
      (i32.load8_u (i32.add (local.get $ptr) (local.get $idx)))))
    
    (local.set $idx (call $getPixelIndex 
      (local.get $x)
      (i32.sub (local.get $y) (i32.const 1))
      (local.get $width)))
    (local.set $sum (f32.add (local.get $sum)
      (f32.mul (f32.const 2)
        (f32.convert_i32_u (i32.load8_u (i32.add (local.get $ptr) (local.get $idx)))))))
    
    (local.set $idx (call $getPixelIndex 
      (i32.add (local.get $x) (i32.const 1))
      (i32.sub (local.get $y) (i32.const 1))
      (local.get $width)))
    (local.set $sum (f32.add (local.get $sum)
      (f32.convert_i32_u (i32.load8_u (i32.add (local.get $ptr) (local.get $idx))))))
    
    ;; Middle row
    (local.set $idx (call $getPixelIndex 
      (i32.sub (local.get $x) (i32.const 1))
      (local.get $y)
      (local.get $width)))
    (local.set $sum (f32.add (local.get $sum)
      (f32.mul (f32.const 2)
        (f32.convert_i32_u (i32.load8_u (i32.add (local.get $ptr) (local.get $idx)))))))
    
    (local.set $idx (call $getPixelIndex 
      (local.get $x)
      (local.get $y)
      (local.get $width)))
    (local.set $sum (f32.add (local.get $sum)
      (f32.mul (f32.const 4)
        (f32.convert_i32_u (i32.load8_u (i32.add (local.get $ptr) (local.get $idx)))))))
    
    (local.set $idx (call $getPixelIndex 
      (i32.add (local.get $x) (i32.const 1))
      (local.get $y)
      (local.get $width)))
    (local.set $sum (f32.add (local.get $sum)
      (f32.mul (f32.const 2)
        (f32.convert_i32_u (i32.load8_u (i32.add (local.get $ptr) (local.get $idx)))))))
    
    ;; Bottom row
    (local.set $idx (call $getPixelIndex 
      (i32.sub (local.get $x) (i32.const 1))
      (i32.add (local.get $y) (i32.const 1))
      (local.get $width)))
    (local.set $sum (f32.add (local.get $sum)
      (f32.convert_i32_u (i32.load8_u (i32.add (local.get $ptr) (local.get $idx))))))
    
    (local.set $idx (call $getPixelIndex 
      (local.get $x)
      (i32.add (local.get $y) (i32.const 1))
      (local.get $width)))
    (local.set $sum (f32.add (local.get $sum)
      (f32.mul (f32.const 2)
        (f32.convert_i32_u (i32.load8_u (i32.add (local.get $ptr) (local.get $idx)))))))
    
    (local.set $idx (call $getPixelIndex 
      (i32.add (local.get $x) (i32.const 1))
      (i32.add (local.get $y) (i32.const 1))
      (local.get $width)))
    (local.set $sum (f32.add (local.get $sum)
      (f32.convert_i32_u (i32.load8_u (i32.add (local.get $ptr) (local.get $idx))))))
    
    (local.get $sum)
  )
  
  ;; Global heap pointer for memory allocation
  (global $heap_ptr (mut i32) (i32.const 0))
)